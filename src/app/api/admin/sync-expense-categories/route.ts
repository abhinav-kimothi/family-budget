import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EXPENSE_CATEGORY_NAMES = [
  "Rent",
  "Groc/Supp",
  "Personnel",
  "Travel/Commute",
  "Commute",
  "Medicines",
  "Utilities",
  "Car",
  "Subscriptions",
  "Eating Out",
  "Ordering In",
  "Gifts",
  "Apparels",
  "Entertainment",
  "Miscellaneous",
  "Existing EMIs",
  "Insurance",
  "Discretionary",
  "Unaccounted",
  "Cuckoo Regalia",
  "Cuckoo BankAcc",
  "Fitness",
] as const;

export async function POST() {
  await requireAdmin();

  const results = [];

  for (let index = 0; index < EXPENSE_CATEGORY_NAMES.length; index += 1) {
    const name = EXPENSE_CATEGORY_NAMES[index];
    const sortOrder = 20 + index;

    const existing = await prisma.category.findFirst({
      where: { name },
    });

    if (!existing) {
      const created = await prisma.category.create({
        data: {
          name,
          type: "EXPENSE",
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
        type: "EXPENSE",
        sortOrder,
        isActive: true,
      },
    });

    results.push({ action: "updated", id: updated.id, name });
  }

  return NextResponse.json({
    status: "ok",
    message: "Expense categories synced.",
    items: results,
  });
}
