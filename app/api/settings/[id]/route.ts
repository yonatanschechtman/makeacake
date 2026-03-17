import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { label, value, unit, category, isHourly } = body;

  const setting = await prisma.setting.update({
    where: { id: parseInt(id) },
    data: { label, value, unit, category, isHourly },
  });

  return NextResponse.json(setting);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.setting.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
