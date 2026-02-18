import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCOME_CATEGORY_NAMES = [
  "Salary",
  "Cashback",
  "Interest",
  "Loan Repayment",
  "Miscellaneous",
  "Balance",
  "Dividend",
  "Advance",
  "Reimbursement",
  "Other Income",
] as const;

export async function POST() {
  await requireAdmin();

  // Idempotently ensure all desired income categories exist and are typed correctly.
  const results = [];

  for (let index = 0; index < INCOME_CATEGORY_NAMES.length; index += 1) {
    const name = INCOME_CATEGORY_NAMES[index];
    const sortOrder = index + 1;

    const existing = await prisma.category.findFirst({
      where: { name },
    });

    if (!existing) {
      const created = await prisma.category.create({
        data: {
          name,
          type: "INCOME",
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
        type: "INCOME",
        sortOrder,
        isActive: true,
      },
    });

    results.push({ action: "updated", id: updated.id, name });
  }

  return NextResponse.json({
    status: "ok",
    message: "Income categories synced.",
    items: results,
  });
}
