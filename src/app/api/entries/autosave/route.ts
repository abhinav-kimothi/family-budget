import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AutosaveBody = {
  year?: number;
  month?: number;
  values?: Record<string, string>;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: AutosaveBody;
  try {
    body = (await request.json()) as AutosaveBody;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const year = Number(body.year);
  const month = Number(body.month);
  const values = body.values ?? {};

  if (!year || !month || month < 1 || month > 12 || typeof values !== "object") {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const categoryIds = new Set<number>();
  for (const key of Object.keys(values)) {
    const m = /^(amount|budget)-(\d+)$/.exec(key);
    if (!m) continue;
    categoryIds.add(Number(m[2]));
  }
  if (categoryIds.size === 0) {
    return NextResponse.json({ ok: true, savedAt: Date.now(), changed: 0 });
  }

  const [categories, existingActuals, existingBudgets] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true, id: { in: Array.from(categoryIds) } },
      select: { id: true },
    }),
    prisma.monthlyEntry.findMany({
      where: { year, month, categoryId: { in: Array.from(categoryIds) } },
      select: { id: true, categoryId: true, amount: true },
    }),
    prisma.budgetEntry.findMany({
      where: { year, month, categoryId: { in: Array.from(categoryIds) } },
      select: { id: true, categoryId: true, amount: true, rebalancedAmount: true },
    }),
  ]);

  const existingActualByCategory = new Map(
    existingActuals.map((e) => [e.categoryId, e]),
  );
  const existingBudgetByCategory = new Map(
    existingBudgets.map((b) => [b.categoryId, b]),
  );

  let changed = 0;
  for (const category of categories) {
    const actualRaw = String(values[`amount-${category.id}`] ?? "").trim();
    const budgetRaw = String(values[`budget-${category.id}`] ?? "").trim();

    if (actualRaw) {
      const amount = Number(actualRaw);
      if (!Number.isNaN(amount)) {
        const existing = existingActualByCategory.get(category.id);
        if (existing) {
          if (Number(existing.amount) !== amount) {
            await prisma.monthlyEntry.update({
              where: { id: existing.id },
              data: { amount },
            });
            changed += 1;
          }
        } else {
          await prisma.monthlyEntry.create({
            data: { year, month, amount, categoryId: category.id },
          });
          changed += 1;
        }
      }
    } else {
      const existing = existingActualByCategory.get(category.id);
      if (existing) {
        await prisma.monthlyEntry.deleteMany({
          where: { year, month, categoryId: category.id },
        });
        changed += 1;
      }
    }

    if (budgetRaw) {
      const amount = Number(budgetRaw);
      if (!Number.isNaN(amount)) {
        const existing = existingBudgetByCategory.get(category.id);
        if (existing) {
          if (Number(existing.amount) !== amount) {
            await prisma.budgetEntry.update({
              where: { id: existing.id },
              data: { amount, rebalancedAmount: null },
            });
            changed += 1;
          }
        } else {
          await prisma.budgetEntry.create({
            data: { year, month, amount, rebalancedAmount: null, categoryId: category.id },
          });
          changed += 1;
        }
      }
    } else {
      const existing = existingBudgetByCategory.get(category.id);
      if (existing) {
        await prisma.budgetEntry.deleteMany({
          where: { year, month, categoryId: category.id },
        });
        changed += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, savedAt: Date.now(), changed });
}
