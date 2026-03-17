import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suggestDensity } from "@/lib/claude";

export async function POST() {
  const candidates = await prisma.ingredientPrice.findMany({
    where: {
      density: null,
      unit: { in: ["גרם", 'מ"ל'] },
    },
    select: { id: true, ingredientName: true },
  });

  let filled = 0;
  await Promise.all(
    candidates.map(async (ing) => {
      try {
        const result = await suggestDensity(ing.ingredientName);
        if (result.density != null) {
          await prisma.ingredientPrice.update({
            where: { id: ing.id },
            data: { density: result.density },
          });
          filled++;
        }
      } catch (e) {
        console.error(`Density lookup failed for ${ing.ingredientName}:`, e);
      }
    })
  );

  return NextResponse.json({ total: candidates.length, filled });
}
