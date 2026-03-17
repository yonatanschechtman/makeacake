import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const settings = await prisma.setting.findMany({ orderBy: { category: "asc" } });
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { key, label, value, unit, category, isHourly } = body;

  if (!key || !label || value == null || !unit || !category) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const setting = await prisma.setting.create({
    data: { key, label, value, unit, category, isHourly: isHourly ?? false },
  });

  return NextResponse.json(setting, { status: 201 });
}

// Seed default settings if none exist
export async function PUT() {
  const count = await prisma.setting.count();
  if (count > 0) return NextResponse.json({ message: "Already seeded" });

  const defaults = [
    { key: "electricity_water", label: "חשמל ומים", value: 5, unit: "₪/שעה", category: "infra", isHourly: true },
    { key: "labor_cost", label: "עלות עבודה", value: 50, unit: "₪/שעה", category: "labor", isHourly: true },
    { key: "box_cost", label: "קופסה/אריזה", value: 5, unit: "₪/יחידה", category: "packaging", isHourly: false },
  ];

  await prisma.setting.createMany({ data: defaults });
  return NextResponse.json({ message: "Seeded defaults" });
}
