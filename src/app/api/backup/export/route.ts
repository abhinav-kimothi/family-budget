import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(cells: Array<string | number | null | undefined>) {
  return cells
    .map((c) => (c == null ? "" : escapeCsvCell(String(c))))
    .join(",");
}

function addSection(
  out: string[],
  name: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  out.push(csvRow(["SECTION", name]));
  out.push(csvRow(headers));
  for (const row of rows) out.push(csvRow(row));
  out.push("");
}

function toCsvNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getExpenseAllocationDelegate() {
  return (
    prisma as unknown as {
      expenseAllocation?: {
        findMany: (args: unknown) => Promise<
          Array<{
            year: number;
            month: number;
            categoryId: number;
            amount: unknown;
            type: "IMMEDIATE" | "QUARTERLY" | "ANNUAL" | "CUSTOM";
            durationMonths: number | null;
            startMode: "THIS_MONTH" | "NEXT_MONTH";
            recognitionStartYear: number | null;
            recognitionStartMonth: number | null;
            needTier: "ESSENTIAL" | "NON_ESSENTIAL" | "TRAVEL" | "LUXURY" | null;
            notes: string | null;
            category: { name: string; type: string };
          }>
        >;
      };
    }
  ).expenseAllocation;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const allocationDelegate = getExpenseAllocationDelegate();
  const [settings, categories, budgets, entries, allocations] = await Promise.all([
    prisma.settings.findFirst({ where: { id: 1 } }),
    prisma.category.findMany({
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.budgetEntry.findMany({
      include: { category: { select: { name: true, type: true } } },
      orderBy: [{ year: "asc" }, { month: "asc" }, { category: { sortOrder: "asc" } }],
    }),
    prisma.monthlyEntry.findMany({
      include: { category: { select: { name: true, type: true } } },
      orderBy: [{ year: "asc" }, { month: "asc" }, { category: { sortOrder: "asc" } }],
    }),
    allocationDelegate
      ? allocationDelegate.findMany({
          include: { category: true },
          orderBy: [{ year: "asc" }, { month: "asc" }, { category: { sortOrder: "asc" } }],
        })
      : Promise.resolve([]),
  ]);

  const lines: string[] = [];
  lines.push(csvRow(["BACKUP_VERSION", "FAMILY_BUDGET_BACKUP_V1"]));
  lines.push(csvRow(["EXPORTED_AT", new Date().toISOString()]));
  lines.push(csvRow(["EXPORTED_BY", user.username]));
  lines.push("");

  addSection(
    lines,
    "settings",
    ["id", "initialBalance", "openingInvestableBalance", "currency"],
    [
      [
        settings?.id ?? 1,
        toCsvNumber(settings?.initialBalance, 0),
        toCsvNumber(settings?.openingInvestableBalance, 0),
        settings?.currency ?? "USD",
      ],
    ],
  );

  addSection(
    lines,
    "categories",
    [
      "name",
      "type",
      "sortOrder",
      "isActive",
      "defaultNeedTier",
      "trackAnnualBudgetRemaining",
      "planRebalanceEligible",
      "planRebalancePriority",
      "planMinimumAmount",
    ],
    categories.map((c) => [
      c.name,
      c.type,
      c.sortOrder,
      c.isActive ? "1" : "0",
      c.defaultNeedTier ?? "",
      c.trackAnnualBudgetRemaining ? "1" : "0",
      c.planRebalanceEligible ? "1" : "0",
      c.planRebalancePriority ?? "",
      toCsvNumber(c.planMinimumAmount, 0),
    ]),
  );

  addSection(
    lines,
    "budget_entries",
    ["year", "month", "category", "type", "amount", "rebalancedAmount"],
    budgets.map((b) => [
      b.year,
      b.month,
      b.category.name,
      b.category.type,
      toCsvNumber(b.amount, 0),
      b.rebalancedAmount == null ? "" : toCsvNumber(b.rebalancedAmount, 0),
    ]),
  );

  addSection(
    lines,
    "monthly_entries",
    ["year", "month", "category", "type", "amount"],
    entries.map((e) => [e.year, e.month, e.category.name, e.category.type, toCsvNumber(e.amount, 0)]),
  );

  addSection(
    lines,
    "expense_allocations",
    [
      "year",
      "month",
      "category",
      "type",
      "amount",
      "allocationType",
      "durationMonths",
      "startMode",
      "recognitionStartYear",
      "recognitionStartMonth",
      "needTier",
      "notes",
    ],
    allocations.map((a) => [
      a.year,
      a.month,
      a.category.name,
      a.category.type,
      toCsvNumber(a.amount, 0),
      a.type,
      a.durationMonths ?? "",
      a.startMode,
      a.recognitionStartYear ?? "",
      a.recognitionStartMonth ?? "",
      a.needTier ?? "",
      a.notes ?? "",
    ]),
  );

  const csv = lines.join("\n");
  const filename = `family-budget-backup-${new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\..+$/, "")}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
