import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await prisma.recipe.findUnique({
    where: { id: parseInt(id) },
    include: { ingredients: true },
  });
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recipe);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { name, instructions, servingSize, prepTimeMin, notes, ingredients } = body;

  // Replace all ingredients
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: parseInt(id) } });

  const recipe = await prisma.recipe.update({
    where: { id: parseInt(id) },
    data: {
      name,
      instructions,
      servingSize,
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

  return NextResponse.json(recipe);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ingredientId, quantity, unit } = await req.json();
  const updated = await prisma.recipeIngredient.update({
    where: { id: ingredientId },
    data: { quantity, unit },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.recipe.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
