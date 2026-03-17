import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchMultiplePrices } from "@/lib/scraper";
import { suggestDensity } from "@/lib/claude";

const CACHE_HOURS = 24;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ingredientNames } = body as { ingredientNames: string[] };

  if (!ingredientNames || !Array.isArray(ingredientNames)) {
    return NextResponse.json({ error: "ingredientNames array required" }, { status: 400 });
  }

  // Resolve aliases: map each requested name to its canonical name
  const allEntries = await prisma.ingredientPrice.findMany({
    where: { ingredientName: { in: ingredientNames } },
    select: { ingredientName: true, aliasOf: true },
  });
  const aliasMap: Record<string, string> = {};
  for (const name of ingredientNames) {
    const entry = allEntries.find((e) => e.ingredientName === name);
    aliasMap[name] = entry?.aliasOf ?? name;
  }
  const canonicalNames = [...new Set(Object.values(aliasMap))];

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - CACHE_HOURS * 60 * 60 * 1000);

  // Check which canonical ingredients need fresh prices
  const cached = await prisma.ingredientPrice.findMany({
    where: { ingredientName: { in: canonicalNames }, lastUpdated: { gt: staleThreshold } },
  });
  const cachedNames = new Set(cached.map((c) => c.ingredientName));
  const toFetch = canonicalNames.filter((name) => !cachedNames.has(name));

  // Fetch fresh prices for stale/missing canonical ingredients
  if (toFetch.length > 0) {
    const freshResults = await fetchMultiplePrices(toFetch);
    for (const result of freshResults) {
      if (result.pricePerUnit !== null && result.unit !== null) {
        await prisma.ingredientPrice.upsert({
          where: { ingredientName: result.ingredientName },
          update: {
            pricePerUnit: result.pricePerUnit,
            unit: result.unit,
            packageInfo: result.packageInfo,
            supermarket: result.supermarket,
            lastUpdated: new Date(),
          },
          create: {
            ingredientName: result.ingredientName,
            pricePerUnit: result.pricePerUnit,
            unit: result.unit,
            packageInfo: result.packageInfo,
            supermarket: result.supermarket,
          },
        });
      }
    }

    // Auto-populate density for newly-priced weight/volume ingredients
    const densityCandidates = freshResults.filter(
      (r) => r.pricePerUnit !== null && (r.unit === "גרם" || r.unit === 'מ"ל')
    );
    if (densityCandidates.length > 0) {
      const withoutDensity = await prisma.ingredientPrice.findMany({
        where: {
          ingredientName: { in: densityCandidates.map((r) => r.ingredientName) },
          density: null,
        },
        select: { id: true, ingredientName: true },
      });
      await Promise.all(
        withoutDensity.map(async (ing) => {
          try {
            const result = await suggestDensity(ing.ingredientName);
            if (result.density != null) {
              await prisma.ingredientPrice.update({
                where: { id: ing.id },
                data: { density: result.density },
              });
            }
          } catch (e) {
            console.error(`Density lookup failed for ${ing.ingredientName}:`, e);
          }
        })
      );
    }
  }

  // Fetch canonical price records
  const canonicalPrices = await prisma.ingredientPrice.findMany({
    where: { ingredientName: { in: canonicalNames } },
  });
  const canonicalMap: Record<string, typeof canonicalPrices[0]> = {};
  for (const p of canonicalPrices) canonicalMap[p.ingredientName] = p;

  // Fetch all alias records that belong to any of these canonical groups
  const aliasRecords = await prisma.ingredientPrice.findMany({
    where: { aliasOf: { in: canonicalNames } },
  });
  // Index aliases by their canonical
  const aliasByCanonical: Record<string, typeof aliasRecords> = {};
  for (const a of aliasRecords) {
    if (!a.aliasOf) continue;
    if (!aliasByCanonical[a.aliasOf]) aliasByCanonical[a.aliasOf] = [];
    aliasByCanonical[a.aliasOf].push(a);
  }

  // Compute group-effective price for each canonical:
  // manual price wins over auto; among same category, take the highest.
  function groupEffectivePrice(canonicalName: string): { pricePerUnit: number; userPrice: number | null } {
    const record = canonicalMap[canonicalName];
    if (!record) return { pricePerUnit: 0, userPrice: null };

    const members = [record, ...(aliasByCanonical[canonicalName] ?? [])].filter(
      (m) => m.unit === record.unit
    );

    const manualPrices = members.filter((m) => m.userPrice != null).map((m) => m.userPrice as number);
    const autoPrices = members.map((m) => m.pricePerUnit);

    if (manualPrices.length > 0) {
      // Any manual price → use highest manual
      return { pricePerUnit: record.pricePerUnit, userPrice: Math.max(...manualPrices) };
    }
    // No manual → highest auto
    return { pricePerUnit: Math.max(...autoPrices), userPrice: null };
  }

  // Build response under original ingredient names
  const result = ingredientNames.map((originalName) => {
    const canonical = aliasMap[originalName];
    const priceRecord = canonicalMap[canonical];
    if (!priceRecord) return null;
    const { pricePerUnit, userPrice } = groupEffectivePrice(canonical);
    return { ...priceRecord, ingredientName: originalName, pricePerUnit, userPrice };
  }).filter(Boolean);

  return NextResponse.json(result);
}
