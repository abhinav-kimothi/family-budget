import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TYPE_LABEL: Record<string, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  INVESTMENT: "Investment",
  OTHER: "Other",
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const mode = searchParams.get("mode") || "both"; // both | plan | actual

  if (!year || !month || month < 1 || month > 12) {
    return new NextResponse("Invalid year or month", { status: 400 });
  }

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  });

  const [entries, budgets] = await Promise.all([
    prisma.monthlyEntry.findMany({
      where: { year, month },
    }),
    prisma.budgetEntry.findMany({
      where: { year, month },
    }),
  ]);

  const actualByCategory = new Map(
    entries.map((e) => [e.categoryId, Number(e.amount)]),
  );
  const planByCategory = new Map(
    budgets.map((b) => [b.categoryId, Number(b.amount)]),
  );

  const includePlan = mode === "both" || mode === "plan";
  const includeActual = mode === "both" || mode === "actual";

  const headers = ["Category", "Type"];
  if (includePlan) headers.push("Plan");
  if (includeActual) headers.push("Actual");

  const rows: string[][] = [headers.map(escapeCsvCell)];

  for (const cat of categories) {
    const typeLabel = TYPE_LABEL[cat.type] ?? cat.type;
    const plan = planByCategory.get(cat.id);
    const actual = actualByCategory.get(cat.id);
    const row: string[] = [
      escapeCsvCell(cat.name),
      escapeCsvCell(typeLabel),
    ];
    if (includePlan) row.push(plan != null ? String(plan) : "");
    if (includeActual) row.push(actual != null ? String(actual) : "");
    rows.push(row);
  }

  const csv = rows.map((r) => r.join(",")).join("\n");
  const filename = `entries-${year}-${String(month).padStart(2, "0")}-${mode}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
