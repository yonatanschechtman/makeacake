import { NextRequest, NextResponse } from "next/server";
import { suggestDensity } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { ingredientName } = await req.json();
  if (!ingredientName) return NextResponse.json({ error: "ingredientName required" }, { status: 400 });
  try {
    const result = await suggestDensity(ingredientName);
    return NextResponse.json(result);
  } catch (err) {
    console.error("suggest-density error:", err);
    return NextResponse.json({ density: null, source: "שגיאה" });
  }
}
