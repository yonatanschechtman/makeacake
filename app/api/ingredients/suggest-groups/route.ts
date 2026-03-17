import { NextRequest, NextResponse } from "next/server";
import { suggestIngredientGroups } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { names } = body as { names: string[] };

  if (!names || !Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: "names array required" }, { status: 400 });
  }

  try {
    const groups = await suggestIngredientGroups(names);
    return NextResponse.json({ groups });
  } catch (err) {
    console.error("suggest-groups error:", err);
    return NextResponse.json({ error: "Failed to suggest groups" }, { status: 500 });
  }
}
