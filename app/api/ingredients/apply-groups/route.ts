import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface GroupToApply {
  canonical: string;
  aliases: string[];
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { groups } = body as { groups: GroupToApply[] };

  if (!groups || !Array.isArray(groups)) {
    return NextResponse.json({ error: "groups array required" }, { status: 400 });
  }

  try {
    for (const group of groups) {
      // Ensure canonical exists and is NOT itself an alias
      await prisma.ingredientPrice.upsert({
        where: { ingredientName: group.canonical },
        update: { aliasOf: null },
        create: { ingredientName: group.canonical, pricePerUnit: 0 },
      });

      // Set aliasOf on each alias entry, skipping self-references
      for (const aliasName of group.aliases) {
        if (aliasName === group.canonical) continue;
        const entry = await prisma.ingredientPrice.findUnique({
          where: { ingredientName: aliasName },
        });
        if (entry) {
          await prisma.ingredientPrice.update({
            where: { ingredientName: aliasName },
            data: { aliasOf: group.canonical },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("apply-groups error:", err);
    return NextResponse.json({ error: "Failed to apply groups" }, { status: 500 });
  }
}
