import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const recipes = await prisma.recipe.findMany({
    include: { ingredients: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(recipes);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, sourceType, sourceUrl, instructions, servingSize, prepTimeMin, notes, ingredients } = body;

  const recipe = await prisma.recipe.create({
    data: {
      name,
      sourceType,
      sourceUrl,
      instructions,
      servingSize: servingSize ?? 1,
      prepTimeMin,
      notes,
      ingredients: {
        create: (ingredients ?? []).map((ing: { name: string; quantity: number; unit: string; notes?: string }) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes,
        })),
      },
    },
    include: { ingredients: true },
  });

  return NextResponse.json(recipe, { status: 201 });
}
