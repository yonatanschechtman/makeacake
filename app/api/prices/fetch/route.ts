import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchMultiplePrices } from "@/lib/scraper";

const CACHE_HOURS = 24;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ingredientNames } = body as { ingredientNames: string[] };

  if (!ingredientNames || !Array.isArray(ingredientNames)) {
    return NextResponse.json({ error: "ingredientNames array required" }, { status: 400 });
  }

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - CACHE_HOURS * 60 * 60 * 1000);

  // Check which ingredients need fresh prices
  const cached = await prisma.ingredientPrice.findMany({
    where: {
      ingredientName: { in: ingredientNames },
      lastUpdated: { gt: staleThreshold },
    },
  });

  const cachedNames = new Set(cached.map((c) => c.ingredientName));
  const toFetch = ingredientNames.filter((name) => !cachedNames.has(name));

  // Fetch fresh prices for stale/missing ingredients
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
  }

  // Return all prices for the requested ingredients
  const allPrices = await prisma.ingredientPrice.findMany({
    where: { ingredientName: { in: ingredientNames } },
  });

  return NextResponse.json(allPrices);
}
