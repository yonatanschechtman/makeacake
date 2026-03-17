import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Normalize package price to price per base unit (gram or ml)
const UNIT_FACTORS: Record<string, { base: string; factor: number }> = {
  'גרם':      { base: 'גרם',   factor: 1 },
  'מ"ל':      { base: 'מ"ל',   factor: 1 },
  'מל':       { base: 'מ"ל',   factor: 1 },
  'ק"ג':      { base: 'גרם',   factor: 1000 },
  'קילוגרם':  { base: 'גרם',   factor: 1000 },
  'ליטר':     { base: 'מ"ל',   factor: 1000 },
  'יחידה':    { base: 'יחידה', factor: 1 },
};

export async function GET() {
  const prices = await prisma.ingredientPrice.findMany({
    orderBy: { ingredientName: "asc" },
  });
  return NextResponse.json(prices);
}

export async function POST(_req: NextRequest) {
  try {
    // Sync: create empty IngredientPrice rows for recipe ingredients that don't have one
    const allIngredients = await prisma.recipeIngredient.findMany({
      select: { name: true },
    });

    const uniqueNames = [...new Set(allIngredients.map((i) => i.name))];

    const existing = await prisma.ingredientPrice.findMany({
      select: { ingredientName: true },
    });
    const existingNames = new Set(existing.map((e) => e.ingredientName));

    const toCreate = uniqueNames.filter((name) => !existingNames.has(name));

    for (const name of toCreate) {
      await prisma.ingredientPrice.upsert({
        where: { ingredientName: name },
        update: {},
        create: { ingredientName: name },
      });
    }

    // Clean up self-referential aliases (aliasOf === own ingredientName)
    const allPrices = await prisma.ingredientPrice.findMany({
      select: { id: true, ingredientName: true, aliasOf: true },
    });
    const selfRefs = allPrices.filter((p) => p.aliasOf === p.ingredientName);
    for (const p of selfRefs) {
      await prisma.ingredientPrice.update({ where: { id: p.id }, data: { aliasOf: null } });
    }

    const prices = await prisma.ingredientPrice.findMany({
      orderBy: { ingredientName: "asc" },
    });
    return NextResponse.json(prices);
  } catch (err) {
    console.error("Ingredients sync error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, userPackagePrice, userPackageSize, userPackageUnit, density, aliasOf } = body as {
    id: number;
    userPackagePrice?: number | null;
    userPackageSize?: number | null;
    userPackageUnit?: string | null;
    density?: number | null;
    aliasOf?: string | null;
  };

  // Validate aliasOf if provided
  if (aliasOf !== undefined) {
    if (aliasOf !== null) {
      // Target must exist and not be an alias itself
      const target = await prisma.ingredientPrice.findUnique({ where: { ingredientName: aliasOf } });
      if (!target) {
        return NextResponse.json({ error: `המרכיב "${aliasOf}" לא נמצא` }, { status: 400 });
      }
      if (target.aliasOf !== null) {
        return NextResponse.json({ error: 'לא ניתן לעשות קיצור לקיצור (רק רמה אחת)' }, { status: 400 });
      }
      // This entry must not have other entries pointing to it
      const current = await prisma.ingredientPrice.findUnique({ where: { id } });
      if (current) {
        const aliasesOfCurrent = await prisma.ingredientPrice.count({
          where: { aliasOf: current.ingredientName },
        });
        if (aliasesOfCurrent > 0) {
          return NextResponse.json({ error: 'מרכיב זה הוא כבר קנוני (יש לו קיצורים)' }, { status: 400 });
        }
      }
    }
  }

  // Compute normalized userPrice
  let userPrice: number | null = null;
  let normalizedUnit: string | undefined = undefined;

  if (userPackagePrice != null && userPackageSize != null && userPackageSize > 0 && userPackageUnit) {
    const norm = UNIT_FACTORS[userPackageUnit];
    if (norm) {
      userPrice = userPackagePrice / (userPackageSize * norm.factor);
      normalizedUnit = norm.base;
    } else {
      userPrice = userPackagePrice / userPackageSize;
      normalizedUnit = userPackageUnit;
    }
  }

  const updated = await prisma.ingredientPrice.update({
    where: { id },
    data: {
      ...(userPackagePrice !== undefined ? { userPackagePrice: userPackagePrice ?? null } : {}),
      ...(userPackageSize !== undefined ? { userPackageSize: userPackageSize ?? null } : {}),
      ...(userPackageUnit !== undefined ? { userPackageUnit: userPackageUnit ?? null } : {}),
      ...(userPrice !== null ? { userPrice } : userPackagePrice === null ? { userPrice: null } : {}),
      ...(normalizedUnit ? { unit: normalizedUnit } : {}),
      ...(density !== undefined ? { density: density ?? null } : {}),
      ...(aliasOf !== undefined ? { aliasOf: aliasOf ?? null } : {}),
    },
  });
  return NextResponse.json(updated);
}
