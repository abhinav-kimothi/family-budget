import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INVESTMENT_CATEGORY_NAMES = [
  "Mutual Funds",
  "Gold",
  "Crypto",
  "ULIP",
] as const;

export async function POST() {
  const results = [];

  for (let index = 0; index < INVESTMENT_CATEGORY_NAMES.length; index += 1) {
    const name = INVESTMENT_CATEGORY_NAMES[index];
    const sortOrder = 60 + index;

    const existing = await prisma.category.findFirst({
      where: { name },
    });

    if (!existing) {
      const created = await prisma.category.create({
        data: {
          name,
          type: "INVESTMENT",
          sortOrder,
          isActive: true,
        },
      });
      results.push({ action: "created", id: created.id, name });
      continue;
    }

    const updated = await prisma.category.update({
      where: { id: existing.id },
      data: {
        type: "INVESTMENT",
        sortOrder,
        isActive: true,
      },
    });

    results.push({ action: "updated", id: updated.id, name });
  }

  return NextResponse.json({
    status: "ok",
    message: "Investment categories synced.",
    items: results,
  });
}

