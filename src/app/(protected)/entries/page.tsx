import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MonthYearNav } from "./MonthYearNav";
import { ClearMonthForm } from "./ClearMonthForm";
import { EntriesDraftAutosave } from "./EntriesDraftAutosave";
import { EntriesFlashQueryCleanup } from "./EntriesFlashQueryCleanup";
import { CollapsibleTableGroup } from "@/components/CollapsibleTableGroup";
import { PersistentDetails } from "@/components/PersistentDetails";
import {
  allocationContributionPerMonth,
  buildAllocationMaps,
  durationMonthsForAllocation,
  recognizedExpenseForCategoryMonth,
} from "@/lib/expenseAllocations";
import type { CategoryType, ExpenseNeedTier } from "@/generated/enums";

function getExpenseAllocationDelegate() {
  return (
    prisma as unknown as {
      expenseAllocation?: {
        findMany: (args: unknown) => Promise<
          Array<{
            id: number;
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
            category: { id: number; name: string; type: string; sortOrder: number | null };
          }>
        >;
        findFirst: (args: unknown) => Promise<{
          id: number;
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
          category?: { id: number; name: string; type: string; sortOrder: number | null };
        } | null>;
        create: (args: unknown) => Promise<unknown>;
        update: (args: unknown) => Promise<unknown>;
        delete: (args: unknown) => Promise<unknown>;
        deleteMany: (args: unknown) => Promise<unknown>;
        aggregate: (args: unknown) => Promise<{ _sum: { amount: unknown | null } }>;
      };
    }
  ).expenseAllocation;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeRebalancedPlan(args: {
  categories: Array<{
    id: number;
    name: string;
    type: string;
    defaultNeedTier: "ESSENTIAL" | "NON_ESSENTIAL" | "TRAVEL" | "LUXURY" | null;
    planRebalanceEligible: boolean;
    planRebalancePriority: number | null;
    planMinimumAmount: unknown;
  }>;
  budgets: Map<number, number | null>;
}) {
  const { categories, budgets } = args;
  const planByCategory = new Map<number, number | null>(budgets);
  const plannedIncome = categories
    .filter((c) => c.type === "INCOME")
    .reduce((sum, c) => round2(sum + Number(planByCategory.get(c.id) ?? 0)), 0);
  const plannedExpenses = categories
    .filter((c) => c.type === "EXPENSE")
    .reduce((sum, c) => round2(sum + Number(planByCategory.get(c.id) ?? 0)), 0);
  const plannedInvestments = categories
    .filter((c) => c.type === "INVESTMENT")
    .reduce((sum, c) => round2(sum + Number(planByCategory.get(c.id) ?? 0)), 0);
  let remainingDeficit = round2(
    Math.max(0, round2(plannedExpenses + plannedInvestments - plannedIncome)),
  );
  const cuts: Array<{ categoryName: string; cut: number }> = [];

  if (remainingDeficit <= 0.0001) {
    return { rebalancedPlanByCategory: planByCategory, cuts, remainingDeficit };
  }

  const candidates = categories
    .filter((c) => c.planRebalanceEligible && (c.type === "EXPENSE" || c.type === "INVESTMENT"))
    .map((c) => {
      const budget = Number(planByCategory.get(c.id) ?? 0);
      const minFloor = Math.max(0, Number(c.planMinimumAmount ?? 0));
      const reducible = Math.max(0, budget - minFloor);
      const tierWeight =
        c.type === "INVESTMENT"
          ? 0
          : c.defaultNeedTier === "LUXURY"
            ? 1
            : c.defaultNeedTier === "NON_ESSENTIAL"
              ? 2
              : c.defaultNeedTier === "TRAVEL"
                ? 3
                : 4;
      const explicitPriority = c.planRebalancePriority ?? null;
      const autoPriorityBase =
        c.type === "INVESTMENT"
          ? 100
          : c.defaultNeedTier === "LUXURY"
            ? 200
            : c.defaultNeedTier === "NON_ESSENTIAL"
              ? 300
              : c.defaultNeedTier === "TRAVEL"
                ? 400
                : 900;
      return {
        category: c,
        budget,
        reducible,
        sortPriority: explicitPriority ?? autoPriorityBase,
        tierWeight,
      };
    })
    .filter((c) => c.reducible > 0.0001)
    .sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
      if (a.tierWeight !== b.tierWeight) return a.tierWeight - b.tierWeight;
      return a.category.name.localeCompare(b.category.name);
    });

  for (const candidate of candidates) {
    if (remainingDeficit <= 0.0001) break;
    const cut = round2(Math.min(remainingDeficit, candidate.reducible));
    if (cut <= 0.0001) continue;
    planByCategory.set(candidate.category.id, round2(candidate.budget - cut));
    remainingDeficit = round2(Math.max(0, remainingDeficit - cut));
    cuts.push({ categoryName: candidate.category.name, cut: round2(cut) });
  }

  return { rebalancedPlanByCategory: planByCategory, cuts, remainingDeficit };
}

async function persistEntriesFromForm(formData: FormData, opts: { rebalancePlan: boolean }) {
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const parsedActualByCategory = new Map<number, number | null>();
  const parsedBudgetByCategory = new Map<number, number | null>();
  for (const category of categories) {
    const actualRaw = String(formData.get(`amount-${category.id}`) || "").trim();
    const budgetRaw = String(formData.get(`budget-${category.id}`) || "").trim();
    const actual = actualRaw === "" ? null : Number(actualRaw);
    const budget = budgetRaw === "" ? null : Number(budgetRaw);
    parsedActualByCategory.set(category.id, actual != null && Number.isFinite(actual) ? actual : null);
    parsedBudgetByCategory.set(category.id, budget != null && Number.isFinite(budget) ? budget : null);
  }

  const rebalanceResult = opts.rebalancePlan
    ? computeRebalancedPlan({
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          defaultNeedTier: c.defaultNeedTier,
          planRebalanceEligible: c.planRebalanceEligible,
          planRebalancePriority: c.planRebalancePriority,
          planMinimumAmount: c.planMinimumAmount,
        })),
        budgets: parsedBudgetByCategory,
      })
    : { rebalancedPlanByCategory: new Map<number, number | null>(), cuts: [] as Array<{ categoryName: string; cut: number }>, remainingDeficit: 0 };

  for (const category of categories) {
    const actualValue = parsedActualByCategory.get(category.id);
    const budgetValue = parsedBudgetByCategory.get(category.id);
    const rebalancedBudgetValue = opts.rebalancePlan
      ? rebalanceResult.rebalancedPlanByCategory.get(category.id) ?? budgetValue
      : null;

    // Actuals (MonthlyEntry)
    if (actualValue != null) {
      const amount = Number(actualValue);
      if (!Number.isNaN(amount)) {
        const existing = await prisma.monthlyEntry.findFirst({
          where: { year, month, categoryId: category.id },
        });

        if (existing) {
          await prisma.monthlyEntry.update({
            where: { id: existing.id },
            data: { amount },
          });
        } else {
          await prisma.monthlyEntry.create({
            data: {
              year,
              month,
              amount,
              categoryId: category.id,
            },
          });
        }
      }
    } else {
      // If cleared, remove any existing actual entry for this month/category
      await prisma.monthlyEntry.deleteMany({
        where: { year, month, categoryId: category.id },
      });
    }

    // Budgets (BudgetEntry)
    if (budgetValue != null) {
      const amount = Number(budgetValue);
      if (!Number.isNaN(amount)) {
        const existingBudget = await prisma.budgetEntry.findFirst({
          where: { year, month, categoryId: category.id },
        });

        if (existingBudget) {
          await prisma.budgetEntry.update({
            where: { id: existingBudget.id },
            data: {
              amount,
              rebalancedAmount:
                opts.rebalancePlan && rebalancedBudgetValue != null
                  ? Number(rebalancedBudgetValue)
                  : null,
            },
          });
        } else {
          await prisma.budgetEntry.create({
            data: {
              year,
              month,
              amount,
              rebalancedAmount:
                opts.rebalancePlan && rebalancedBudgetValue != null
                  ? Number(rebalancedBudgetValue)
                  : null,
              categoryId: category.id,
            },
          });
        }
      }
    } else {
      // If cleared, remove any existing budget entry
      await prisma.budgetEntry.deleteMany({
        where: { year, month, categoryId: category.id },
      });
    }
  }

  const cutsApplied = rebalanceResult.cuts.length;
  const totalCut = rebalanceResult.cuts.reduce((s, c) => s + c.cut, 0);
  const totalCutRounded = round2(totalCut);
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (opts.rebalancePlan) {
    params.set("planRebalancedRun", "1");
  }
  if (opts.rebalancePlan && (cutsApplied > 0 || rebalanceResult.remainingDeficit > 0.0001)) {
    params.set("planRebalanced", "1");
    params.set("rebalancedCount", String(cutsApplied));
    params.set("rebalancedCut", totalCutRounded.toFixed(2));
    if (rebalanceResult.remainingDeficit > 0.0001) {
      params.set("rebalancedResidualDeficit", rebalanceResult.remainingDeficit.toFixed(2));
    }
  } else if (opts.rebalancePlan && cutsApplied === 0) {
    params.set("planRebalancedNoChange", "1");
  }
  redirect(`/entries?${params.toString()}`);
}

async function saveEntries(formData: FormData) {
  "use server";
  await requireAdmin();
  await persistEntriesFromForm(formData, { rebalancePlan: false });
}

async function rebalanceAndSaveEntries(formData: FormData) {
  "use server";
  await requireAdmin();
  await persistEntriesFromForm(formData, { rebalancePlan: true });
}

async function rebalanceAllYearPlans(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!year) {
    redirect("/entries");
  }

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const budgetRows = await prisma.budgetEntry.findMany({
    where: { year },
    orderBy: [{ month: "asc" }, { categoryId: "asc" }],
  });

  const budgetRowsByMonth = new Map<number, typeof budgetRows>();
  for (const row of budgetRows) {
    const list = budgetRowsByMonth.get(row.month) ?? [];
    list.push(row);
    budgetRowsByMonth.set(row.month, list);
  }

  let monthsProcessed = 0;
  let monthsWithCuts = 0;
  let unresolvedMonths = 0;
  let totalCuts = 0;

  for (const m of Array.from(budgetRowsByMonth.keys()).sort((a, b) => a - b)) {
    const monthBudgets = budgetRowsByMonth.get(m) ?? [];
    const budgetMap = new Map<number, number | null>();
    for (const c of categories) {
      const row = monthBudgets.find((b) => b.categoryId === c.id);
      budgetMap.set(c.id, row ? Number(row.amount) : null);
    }

    const result = computeRebalancedPlan({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        defaultNeedTier: c.defaultNeedTier,
        planRebalanceEligible: c.planRebalanceEligible,
        planRebalancePriority: c.planRebalancePriority,
        planMinimumAmount: c.planMinimumAmount,
      })),
      budgets: budgetMap,
    });

    for (const row of monthBudgets) {
      const rebalanced = result.rebalancedPlanByCategory.get(row.categoryId);
      await prisma.budgetEntry.update({
        where: { id: row.id },
        data: {
          rebalancedAmount:
            rebalanced != null ? round2(Number(rebalanced)) : null,
        },
      });
    }

    monthsProcessed += 1;
    if (result.cuts.length > 0) monthsWithCuts += 1;
    if (result.remainingDeficit > 0.0001) unresolvedMonths += 1;
    totalCuts = round2(totalCuts + result.cuts.reduce((s, c) => round2(s + c.cut), 0));
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");

  const params = new URLSearchParams({
    year: String(year),
    month: String(month || 1),
    bulkRebalanced: "1",
    bulkRebalancedMonths: String(monthsProcessed),
    bulkRebalancedCutMonths: String(monthsWithCuts),
    bulkRebalancedTotalCut: totalCuts.toFixed(2),
    bulkRebalancedUnresolvedMonths: String(unresolvedMonths),
  });
  redirect(`/entries?${params.toString()}`);
}

async function copyBudgetsFromPreviousMonth(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  // Previous month (handle January -> December of previous year)
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const previousBudgets = await prisma.budgetEntry.findMany({
    where: { year: prevYear, month: prevMonth },
  });

  for (const prev of previousBudgets) {
    const existing = await prisma.budgetEntry.findFirst({
      where: { year, month, categoryId: prev.categoryId },
    });

    if (existing) {
      await prisma.budgetEntry.update({
        where: { id: existing.id },
        data: { amount: prev.amount, rebalancedAmount: null },
      });
    } else {
      await prisma.budgetEntry.create({
        data: {
          year,
          month,
          amount: prev.amount,
          rebalancedAmount: null,
          categoryId: prev.categoryId,
        },
      });
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?year=${year}&month=${month}`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let cell = "";
      i += 1;
      while (i < line.length) {
        if (line[i] === '"') {
          i += 1;
          if (line[i] === '"') {
            cell += '"';
            i += 1;
          } else break;
        } else {
          cell += line[i];
          i += 1;
        }
      }
      out.push(cell);
      if (line[i] === ",") i += 1;
    } else {
      const j = line.indexOf(",", i);
      const cell =
        j === -1 ? line.slice(i) : line.slice(i, j);
      out.push(cell.trim());
      i = j === -1 ? line.length : j + 1;
    }
  }
  return out;
}

function normalizeType(type: string): string {
  const t = type.trim().toUpperCase();
  if (t === "INCOME" || t === "EXPENSE" || t === "INVESTMENT" || t === "OTHER")
    return t;
  if (t === "INVESTMENTS") return "INVESTMENT";
  return t;
}

function parseCategoryType(type: string): CategoryType | null {
  const t = normalizeType(type);
  if (t === "INCOME" || t === "EXPENSE" || t === "INVESTMENT" || t === "OTHER") {
    return t;
  }
  return null;
}

function parseNeedTier(value: string): ExpenseNeedTier | null {
  const v = value.trim().toUpperCase();
  if (v === "ESSENTIAL" || v === "NON_ESSENTIAL" || v === "TRAVEL" || v === "LUXURY") {
    return v;
  }
  return null;
}

function toBoolFlag(value: string | undefined, defaultValue = false) {
  if (value == null) return defaultValue;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "y") return true;
  if (v === "0" || v === "false" || v === "no" || v === "n") return false;
  return defaultValue;
}

function parseBackupSections(lines: string[]) {
  const sections = new Map<
    string,
    { headers: string[]; rows: string[][] }
  >();

  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i >= lines.length) return sections;
  const first = parseCsvLine(lines[i] || "");
  if (
    (first[0] || "").trim().toUpperCase() !== "BACKUP_VERSION" ||
    (first[1] || "").trim().toUpperCase() !== "FAMILY_BUDGET_BACKUP_V1"
  ) {
    return sections;
  }
  i += 1;

  while (i < lines.length) {
    const raw = lines[i]?.trim() ?? "";
    if (!raw) {
      i += 1;
      continue;
    }
    const cells = parseCsvLine(lines[i] || "");
    const marker = (cells[0] || "").trim().toUpperCase();
    if (marker !== "SECTION") {
      i += 1;
      continue;
    }
    const sectionName = (cells[1] || "").trim().toLowerCase();
    i += 1;
    while (i < lines.length && !(lines[i] || "").trim()) i += 1;
    if (i >= lines.length) break;

    const headers = parseCsvLine(lines[i] || "").map((h) => h.trim());
    i += 1;
    const rows: string[][] = [];
    while (i < lines.length) {
      const rowRaw = lines[i] ?? "";
      const rowTrim = rowRaw.trim();
      if (!rowTrim) {
        i += 1;
        break;
      }
      const maybeSection = parseCsvLine(rowRaw);
      if ((maybeSection[0] || "").trim().toUpperCase() === "SECTION") {
        break;
      }
      rows.push(parseCsvLine(rowRaw));
      i += 1;
    }
    sections.set(sectionName, { headers, rows });
  }

  return sections;
}

async function uploadEntriesCsv(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const file = formData.get("csvFile") as File | null;

  if (!year || !month || !file?.size) {
    redirect(`/entries?year=${year}&month=${month}&upload=error`);
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    redirect(`/entries?year=${year}&month=${month}&upload=empty`);
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const categoryIdx = headers.findIndex(
    (h) => h === "category" || h === "category name",
  );
  const typeIdx = headers.findIndex((h) => h === "type");
  const planIdx = headers.findIndex((h) => h === "plan" || h === "planned");
  const actualIdx = headers.findIndex(
    (h) => h === "actual" || h === "actuals" || h === "actual amount",
  );

  if (categoryIdx === -1 || typeIdx === -1) {
    redirect(`/entries?year=${year}&month=${month}&upload=format`);
  }
  const hasPlan = planIdx >= 0;
  const hasActual = actualIdx >= 0;
  if (!hasPlan && !hasActual) {
    redirect(`/entries?year=${year}&month=${month}&upload=format`);
  }

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const categoryByKey = new Map<string, { id: number }>();
  for (const c of categories) {
    const key = `${c.name.trim().toLowerCase()}|${c.type}`;
    categoryByKey.set(key, { id: c.id });
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const catName = (cells[categoryIdx] ?? "").trim();
    const typeStr = normalizeType(cells[typeIdx] ?? "");
    if (!catName) continue;

    const key = `${catName.toLowerCase()}|${typeStr}`;
    const cat = categoryByKey.get(key);
    if (!cat) continue;

    if (hasPlan) {
      const planRaw = (cells[planIdx] ?? "").trim().replace(/,/g, "");
      if (planRaw !== "") {
        const amount = Number(planRaw);
        if (Number.isFinite(amount)) {
          const existing = await prisma.budgetEntry.findFirst({
            where: { year, month, categoryId: cat.id },
          });
          if (existing) {
            await prisma.budgetEntry.update({
              where: { id: existing.id },
              data: { amount, rebalancedAmount: null },
            });
          } else {
            await prisma.budgetEntry.create({
              data: { year, month, categoryId: cat.id, amount, rebalancedAmount: null },
            });
          }
        }
      }
    }

    if (hasActual) {
      const actualRaw = (cells[actualIdx] ?? "").trim().replace(/,/g, "");
      if (actualRaw !== "") {
        const amount = Number(actualRaw);
        if (Number.isFinite(amount)) {
          const existing = await prisma.monthlyEntry.findFirst({
            where: { year, month, categoryId: cat.id },
          });
          if (existing) {
            await prisma.monthlyEntry.update({
              where: { id: existing.id },
              data: { amount },
            });
          } else {
            await prisma.monthlyEntry.create({
              data: { year, month, categoryId: cat.id, amount },
            });
          }
        }
      } else {
        await prisma.monthlyEntry.deleteMany({
          where: { year, month, categoryId: cat.id },
        });
      }
    }
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&upload=ok`);
}

async function uploadFullBackupCsv(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const file = formData.get("backupCsvFile") as File | null;
  const allocDelegate = getExpenseAllocationDelegate();

  if (!year || !month || !file?.size) {
    redirect(`/entries?year=${year}&month=${month}&upload=backup_error`);
  }
  if (!allocDelegate) {
    redirect(`/entries?year=${year}&month=${month}&upload=backup_unavailable`);
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const sections = parseBackupSections(lines);
  if (!sections.size) {
    redirect(`/entries?year=${year}&month=${month}&upload=backup_format`);
  }

  const settingsSection = sections.get("settings");
  const categoriesSection = sections.get("categories");
  const budgetsSection = sections.get("budget_entries");
  const entriesSection = sections.get("monthly_entries");
  const allocationsSection = sections.get("expense_allocations");

  if (!categoriesSection || !budgetsSection || !entriesSection || !allocationsSection) {
    redirect(`/entries?year=${year}&month=${month}&upload=backup_format`);
  }

  if (settingsSection && settingsSection.rows.length > 0) {
    const h = new Map(
      settingsSection.headers.map((k, idx) => [k.trim().toLowerCase(), idx]),
    );
    const r = settingsSection.rows[0] || [];
    const initialBalance = Number(r[h.get("initialbalance") ?? -1] || 0);
    const openingInvestableBalance = Number(
      r[h.get("openinginvestablebalance") ?? -1] || 0,
    );
    const currency = String(r[h.get("currency") ?? -1] || "USD").trim() || "USD";
    await prisma.settings.upsert({
      where: { id: 1 },
      update: {
        initialBalance: Number.isFinite(initialBalance) ? initialBalance : 0,
        openingInvestableBalance: Number.isFinite(openingInvestableBalance)
          ? openingInvestableBalance
          : 0,
        currency,
      },
      create: {
        id: 1,
        initialBalance: Number.isFinite(initialBalance) ? initialBalance : 0,
        openingInvestableBalance: Number.isFinite(openingInvestableBalance)
          ? openingInvestableBalance
          : 0,
        currency,
      },
    });
  }

  const existingCategories = await prisma.category.findMany();
  const existingByKey = new Map(
    existingCategories.map((c) => [
      `${c.name.trim().toLowerCase()}|${c.type}`,
      c,
    ]),
  );

  for (const row of categoriesSection.rows) {
    const h = new Map(
      categoriesSection.headers.map((k, idx) => [k.trim().toLowerCase(), idx]),
    );
    const name = String(row[h.get("name") ?? -1] || "").trim();
    const type = parseCategoryType(String(row[h.get("type") ?? -1] || ""));
    if (!name || !type) continue;

    const sortOrderRaw = Number(row[h.get("sortorder") ?? -1] || 0);
    const planPriorityRaw = String(row[h.get("planrebalancepriority") ?? -1] || "").trim();
    const planMinRaw = Number(row[h.get("planminimumamount") ?? -1] || 0);
    const defaultNeedTier = parseNeedTier(String(row[h.get("defaultneedtier") ?? -1] || ""));
    const data = {
      sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : 0,
      isActive: toBoolFlag(row[h.get("isactive") ?? -1], true),
      defaultNeedTier,
      trackAnnualBudgetRemaining: toBoolFlag(
        row[h.get("trackannualbudgetremaining") ?? -1],
        false,
      ),
      planRebalanceEligible: toBoolFlag(
        row[h.get("planrebalanceeligible") ?? -1],
        false,
      ),
      planRebalancePriority:
        planPriorityRaw === ""
          ? null
          : Number.isFinite(Number(planPriorityRaw))
            ? Math.max(1, Math.trunc(Number(planPriorityRaw)))
            : null,
      planMinimumAmount:
        Number.isFinite(planMinRaw) && planMinRaw >= 0 ? planMinRaw : 0,
    };

    const key = `${name.toLowerCase()}|${type}`;
    const existing = existingByKey.get(key);
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data,
      });
    } else {
      const created = await prisma.category.create({
        data: { name, type, ...data },
      });
      existingByKey.set(key, created);
    }
  }

  const refreshedCategories = await prisma.category.findMany();
  const categoryByKey = new Map(
    refreshedCategories.map((c) => [
      `${c.name.trim().toLowerCase()}|${c.type}`,
      c.id,
    ]),
  );

  await prisma.$transaction([
    prisma.monthlyEntry.deleteMany({}),
    prisma.budgetEntry.deleteMany({}),
  ]);
  await allocDelegate.deleteMany({ where: {} } as unknown as never);

  for (const row of entriesSection.rows) {
    const h = new Map(
      entriesSection.headers.map((k, idx) => [k.trim().toLowerCase(), idx]),
    );
    const yr = Number(row[h.get("year") ?? -1]);
    const mo = Number(row[h.get("month") ?? -1]);
    const category = String(row[h.get("category") ?? -1] || "").trim();
    const type = parseCategoryType(String(row[h.get("type") ?? -1] || ""));
    const amount = Number(String(row[h.get("amount") ?? -1] || "").replace(/,/g, ""));
    const catId = type ? categoryByKey.get(`${category.toLowerCase()}|${type}`) : undefined;
    if (!catId || !Number.isFinite(yr) || !Number.isFinite(mo) || !Number.isFinite(amount)) continue;
    await prisma.monthlyEntry.create({
      data: { year: yr, month: mo, categoryId: catId, amount },
    });
  }

  for (const row of budgetsSection.rows) {
    const h = new Map(
      budgetsSection.headers.map((k, idx) => [k.trim().toLowerCase(), idx]),
    );
    const yr = Number(row[h.get("year") ?? -1]);
    const mo = Number(row[h.get("month") ?? -1]);
    const category = String(row[h.get("category") ?? -1] || "").trim();
    const type = parseCategoryType(String(row[h.get("type") ?? -1] || ""));
    const amount = Number(String(row[h.get("amount") ?? -1] || "").replace(/,/g, ""));
    const rebRaw = String(row[h.get("rebalancedamount") ?? -1] || "").trim();
    const rebalancedAmount =
      rebRaw === ""
        ? null
        : Number.isFinite(Number(rebRaw.replace(/,/g, "")))
          ? Number(rebRaw.replace(/,/g, ""))
          : null;
    const catId = type ? categoryByKey.get(`${category.toLowerCase()}|${type}`) : undefined;
    if (!catId || !Number.isFinite(yr) || !Number.isFinite(mo) || !Number.isFinite(amount)) continue;
    await prisma.budgetEntry.create({
      data: { year: yr, month: mo, categoryId: catId, amount, rebalancedAmount },
    });
  }

  for (const row of allocationsSection.rows) {
    const h = new Map(
      allocationsSection.headers.map((k, idx) => [k.trim().toLowerCase(), idx]),
    );
    const yr = Number(row[h.get("year") ?? -1]);
    const mo = Number(row[h.get("month") ?? -1]);
    const category = String(row[h.get("category") ?? -1] || "").trim();
    const categoryType = parseCategoryType(String(row[h.get("type") ?? -1] || ""));
    const amount = Number(String(row[h.get("amount") ?? -1] || "").replace(/,/g, ""));
    const allocationType = String(row[h.get("allocationtype") ?? -1] || "").trim().toUpperCase();
    const durationRaw = String(row[h.get("durationmonths") ?? -1] || "").trim();
    const startModeRaw = String(row[h.get("startmode") ?? -1] || "THIS_MONTH").trim().toUpperCase();
    const rsYearRaw = String(row[h.get("recognitionstartyear") ?? -1] || "").trim();
    const rsMonthRaw = String(row[h.get("recognitionstartmonth") ?? -1] || "").trim();
    const needTierRaw = String(row[h.get("needtier") ?? -1] || "").trim().toUpperCase();
    const notes = String(row[h.get("notes") ?? -1] || "").trim();
    const catId = categoryType
      ? categoryByKey.get(`${category.toLowerCase()}|${categoryType}`)
      : undefined;
    if (!catId || categoryType !== "EXPENSE") continue;
    if (!Number.isFinite(yr) || !Number.isFinite(mo) || !Number.isFinite(amount) || amount <= 0) continue;
    if (!["IMMEDIATE", "QUARTERLY", "ANNUAL", "CUSTOM"].includes(allocationType)) continue;
    if (!["THIS_MONTH", "NEXT_MONTH"].includes(startModeRaw)) continue;
    const durationMonths =
      durationRaw === "" ? null : Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : null;
    const recognitionStartYear =
      rsYearRaw === "" ? null : Number.isFinite(Number(rsYearRaw)) ? Number(rsYearRaw) : null;
    const recognitionStartMonth =
      rsMonthRaw === "" ? null : Number.isFinite(Number(rsMonthRaw)) ? Number(rsMonthRaw) : null;
    const needTier = parseNeedTier(needTierRaw);

    await allocDelegate.create({
      data: {
        year: yr,
        month: mo,
        categoryId: catId,
        amount,
        type: allocationType,
        durationMonths,
        startMode: startModeRaw,
        recognitionStartYear,
        recognitionStartMonth,
        needTier,
        notes: notes || null,
      },
    } as unknown as never);
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  revalidatePath("/categories");
  redirect(`/entries?year=${year}&month=${month}&upload=backup_ok`);
}

async function clearMonthPlan(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  await prisma.budgetEntry.deleteMany({ where: { year, month } });

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&cleared=plan`);
}

async function clearMonthActuals(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  await prisma.monthlyEntry.deleteMany({ where: { year, month } });

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&cleared=actuals`);
}

async function addExpenseAllocation(formData: FormData) {
  "use server";

  await requireAdmin();

  const delegate = getExpenseAllocationDelegate();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const categoryId = Number(formData.get("categoryId"));
  const amount = Number(formData.get("allocationAmount"));
  const type = String(formData.get("allocationType") || "IMMEDIATE");
  const recognitionStartYear = Number(formData.get("recognitionStartYear"));
  const recognitionStartMonth = Number(formData.get("recognitionStartMonth"));
  const allocationNeedTierRaw = String(formData.get("allocationNeedTier") || "").trim();
  const customDurationRaw = String(formData.get("customDuration") || "").trim();
  const notes = String(formData.get("allocationNotes") || "").trim();
  const needTier =
    allocationNeedTierRaw === "ESSENTIAL" ||
    allocationNeedTierRaw === "NON_ESSENTIAL" ||
    allocationNeedTierRaw === "TRAVEL" ||
    allocationNeedTierRaw === "LUXURY"
      ? allocationNeedTierRaw
      : null;

  if (!delegate) {
    redirect(`/entries?year=${year}&month=${month}&alloc=unavailable`);
  }
  if (!year || !month || !categoryId || !Number.isFinite(amount) || amount <= 0) {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }
  if (
    !Number.isFinite(recognitionStartYear) ||
    !Number.isFinite(recognitionStartMonth) ||
    recognitionStartMonth < 1 ||
    recognitionStartMonth > 12
  ) {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }

  let durationMonths: number | null = null;
  if (type === "CUSTOM") {
    const d = Number(customDurationRaw);
    if (!Number.isFinite(d) || d < 1 || d > 120) {
      redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
    }
    durationMonths = d;
  }

  const actualEntry = await prisma.monthlyEntry.findFirst({
    where: { year, month, categoryId },
  });
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { defaultNeedTier: true, type: true },
  });
  const actualAmount = Number(actualEntry?.amount ?? 0);
  if (actualAmount <= 0) {
    redirect(`/entries?year=${year}&month=${month}&alloc=noactual`);
  }
  if (!category || category.type !== "EXPENSE") {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }

  const existing = await delegate.aggregate({
    where: { year, month, categoryId },
    _sum: { amount: true },
  });
  const allocatedSoFar = Number(existing._sum.amount ?? 0);
  if (allocatedSoFar + amount > actualAmount + 1e-9) {
    redirect(`/entries?year=${year}&month=${month}&alloc=overflow`);
  }

  await delegate.create({
    data: {
      year,
      month,
      categoryId,
      amount,
      type,
      durationMonths,
      startMode: "THIS_MONTH",
      recognitionStartYear,
      recognitionStartMonth,
      needTier: needTier ?? category.defaultNeedTier ?? null,
      notes: notes || null,
    },
  });

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&alloc=created`);
}

async function deleteExpenseAllocation(formData: FormData) {
  "use server";

  await requireAdmin();

  const delegate = getExpenseAllocationDelegate();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const id = Number(formData.get("id"));

  if (!delegate) {
    redirect(`/entries?year=${year}&month=${month}&alloc=unavailable`);
  }
  if (!id) {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }

  await delegate.delete({ where: { id } });
  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&alloc=deleted`);
}

async function updateExpenseAllocation(formData: FormData) {
  "use server";

  await requireAdmin();

  const delegate = getExpenseAllocationDelegate();
  const id = Number(formData.get("id"));
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const categoryId = Number(formData.get("categoryId"));
  const amount = Number(formData.get("allocationAmount"));
  const type = String(formData.get("allocationType") || "IMMEDIATE");
  const recognitionStartYear = Number(formData.get("recognitionStartYear"));
  const recognitionStartMonth = Number(formData.get("recognitionStartMonth"));
  const allocationNeedTierRaw = String(formData.get("allocationNeedTier") || "").trim();
  const customDurationRaw = String(formData.get("customDuration") || "").trim();
  const notes = String(formData.get("allocationNotes") || "").trim();
  const needTier =
    allocationNeedTierRaw === "ESSENTIAL" ||
    allocationNeedTierRaw === "NON_ESSENTIAL" ||
    allocationNeedTierRaw === "TRAVEL" ||
    allocationNeedTierRaw === "LUXURY"
      ? allocationNeedTierRaw
      : null;

  if (!delegate) {
    redirect(`/entries?year=${year}&month=${month}&alloc=unavailable`);
  }
  if (!id || !year || !month || !categoryId || !Number.isFinite(amount) || amount <= 0) {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }
  if (
    !Number.isFinite(recognitionStartYear) ||
    !Number.isFinite(recognitionStartMonth) ||
    recognitionStartMonth < 1 ||
    recognitionStartMonth > 12
  ) {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }

  let durationMonths: number | null = null;
  if (type === "CUSTOM") {
    const d = Number(customDurationRaw);
    if (!Number.isFinite(d) || d < 1 || d > 120) {
      redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
    }
    durationMonths = d;
  }

  const existingAllocation = await delegate.findFirst({ where: { id } });
  if (!existingAllocation) {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }

  const actualEntry = await prisma.monthlyEntry.findFirst({
    where: { year, month, categoryId },
  });
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { defaultNeedTier: true, type: true },
  });
  const actualAmount = Number(actualEntry?.amount ?? 0);
  if (actualAmount <= 0) {
    redirect(`/entries?year=${year}&month=${month}&alloc=noactual`);
  }
  if (!category || category.type !== "EXPENSE") {
    redirect(`/entries?year=${year}&month=${month}&alloc=invalid`);
  }

  const existingInCategory = await delegate.aggregate({
    where: { year, month, categoryId },
    _sum: { amount: true },
  });
  const totalInCategory = Number(existingInCategory._sum.amount ?? 0);
  const currentAmountIfSameCategory =
    existingAllocation.year === year &&
    existingAllocation.month === month &&
    existingAllocation.categoryId === categoryId
      ? Number(existingAllocation.amount ?? 0)
      : 0;
  const allocatedExcludingCurrent = totalInCategory - currentAmountIfSameCategory;
  if (allocatedExcludingCurrent + amount > actualAmount + 1e-9) {
    redirect(`/entries?year=${year}&month=${month}&alloc=overflow`);
  }

  await delegate.update({
    where: { id },
    data: {
      categoryId,
      amount,
      type,
      durationMonths,
      startMode: "THIS_MONTH",
      recognitionStartYear,
      recognitionStartMonth,
      needTier: needTier ?? category.defaultNeedTier ?? null,
      notes: notes || null,
    },
  });

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&alloc=updated`);
}

function monthLabel(m: number) {
  return new Date(2000, m - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    upload?: string;
    alloc?: string;
    allocEditId?: string;
    planRebalanced?: string;
    planRebalancedRun?: string;
    planRebalancedNoChange?: string;
    bulkRebalanced?: string;
    bulkRebalancedMonths?: string;
    bulkRebalancedCutMonths?: string;
    bulkRebalancedTotalCut?: string;
    bulkRebalancedUnresolvedMonths?: string;
    rebalancedCount?: string;
    rebalancedCut?: string;
    rebalancedResidualDeficit?: string;
    cleared?: "plan" | "actuals" | string;
  }>;
}) {
  const user = await requireAdmin();

  const params = await searchParams;
  const uploadStatus = params.upload;
  const cleared = params.cleared;
  const allocStatus = params.alloc;
  const allocEditId = params.allocEditId ? Number(params.allocEditId) : null;
  const planRebalanced = params.planRebalanced === "1";
  const planRebalancedRun = params.planRebalancedRun === "1";
  const planRebalancedNoChange = params.planRebalancedNoChange === "1";
  const bulkRebalanced = params.bulkRebalanced === "1";
  const bulkRebalancedMonths = params.bulkRebalancedMonths ? Number(params.bulkRebalancedMonths) : 0;
  const bulkRebalancedCutMonths = params.bulkRebalancedCutMonths ? Number(params.bulkRebalancedCutMonths) : 0;
  const bulkRebalancedTotalCut = params.bulkRebalancedTotalCut ? Number(params.bulkRebalancedTotalCut) : 0;
  const bulkRebalancedUnresolvedMonths = params.bulkRebalancedUnresolvedMonths
    ? Number(params.bulkRebalancedUnresolvedMonths)
    : 0;
  const rebalancedCount = params.rebalancedCount ? Number(params.rebalancedCount) : 0;
  const rebalancedCut = params.rebalancedCut ? Number(params.rebalancedCut) : 0;
  const rebalancedResidualDeficit = params.rebalancedResidualDeficit
    ? Number(params.rebalancedResidualDeficit)
    : 0;

  const now = new Date();
  const selectedYear = params.year
    ? Number(params.year)
    : now.getFullYear();
  const selectedMonth = params.month
    ? Number(params.month)
    : now.getMonth() + 1;

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const existingEntries = await prisma.monthlyEntry.findMany({
    where: { year: selectedYear, month: selectedMonth },
  });

  const existingBudgets = await prisma.budgetEntry.findMany({
    where: { year: selectedYear, month: selectedMonth },
  });
  const expenseAllocationDelegate = getExpenseAllocationDelegate();
  const monthAllocations = expenseAllocationDelegate
    ? await expenseAllocationDelegate.findMany({
        where: { year: selectedYear, month: selectedMonth },
        include: { category: true },
        orderBy: [{ category: { sortOrder: "asc" } }, { id: "asc" }],
      })
    : [];
  const allAllocations = expenseAllocationDelegate
    ? await expenseAllocationDelegate.findMany({
        include: { category: true },
      })
    : [];
  const allocationBeingEdited =
    allocEditId && Number.isFinite(allocEditId)
      ? monthAllocations.find((a) => a.id === allocEditId) ?? null
      : null;

  const existingByCategory = new Map(
    existingEntries.map((e) => [e.categoryId, e]),
  );

  const budgetByCategory = new Map(
    existingBudgets.map((e) => [e.categoryId, e]),
  );
  const allocationByCategory = new Map<number, typeof monthAllocations>();
  for (const a of monthAllocations) {
    const list = allocationByCategory.get(a.categoryId) ?? [];
    list.push(a);
    allocationByCategory.set(a.categoryId, list);
  }
  const { allocatedPaidMonthByCategory, recognizedContributionByCategoryMonth } =
    buildAllocationMaps(
      allAllocations.map((a) => ({
        id: a.id,
        year: a.year,
        month: a.month,
        categoryId: a.categoryId,
        amount: Number(a.amount),
        type: a.type,
        durationMonths: a.durationMonths,
        startMode: a.startMode,
        recognitionStartYear: a.recognitionStartYear,
        recognitionStartMonth: a.recognitionStartMonth,
        needTier: a.needTier,
      })),
    );
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const budgetTotals = categories.reduce(
    (acc, c) => {
      const b = budgetByCategory.get(c.id);
      const plan = Number(b?.amount ?? 0);
      const rebalanced = Number((b as { rebalancedAmount?: unknown } | undefined)?.rebalancedAmount ?? b?.amount ?? 0);
      if (c.type === "INCOME") {
        acc.incomePlan = round2(acc.incomePlan + plan);
        acc.incomeRebalanced = round2(acc.incomeRebalanced + rebalanced);
      } else if (c.type === "EXPENSE") {
        acc.expensePlan = round2(acc.expensePlan + plan);
        acc.expenseRebalanced = round2(acc.expenseRebalanced + rebalanced);
      } else if (c.type === "INVESTMENT") {
        acc.investmentPlan = round2(acc.investmentPlan + plan);
        acc.investmentRebalanced = round2(acc.investmentRebalanced + rebalanced);
      }
      return acc;
    },
    {
      incomePlan: 0,
      incomeRebalanced: 0,
      expensePlan: 0,
      expenseRebalanced: 0,
      investmentPlan: 0,
      investmentRebalanced: 0,
    },
  );
  const plannedCashflow = round2(
    budgetTotals.incomePlan - budgetTotals.expensePlan - budgetTotals.investmentPlan,
  );
  const rebalancedPlannedCashflow = round2(
    budgetTotals.incomeRebalanced -
      budgetTotals.expenseRebalanced -
      budgetTotals.investmentRebalanced,
  );
  const entriesFormId = `entries-form-${selectedYear}-${selectedMonth}`;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-slate-900 dark:text-slate-100">
            Monthly totals
          </h1>
          <p className="text-xs text-slate-800 dark:text-slate-300">
            One total per category for the selected month.
          </p>
        </div>
      </header>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <span className="font-medium">Workflow:</span> First enter/save monthly Plan and Actual totals. Then optionally open the allocation panel to split expense amounts for the Dashboard's Recognized view.
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <MonthYearNav
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
        />
        <p className="text-[11px] text-slate-800 dark:text-slate-300">
          <span className="font-medium text-slate-700 dark:text-slate-200">{user.username}</span> · admin
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <form action={copyBudgetsFromPreviousMonth} className="inline">
            <input type="hidden" name="year" value={selectedYear} />
            <input type="hidden" name="month" value={selectedMonth} />
            <button
              type="submit"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Copy plans from previous month
            </button>
          </form>
          <form action={rebalanceAllYearPlans} className="inline">
            <input type="hidden" name="year" value={selectedYear} />
            <input type="hidden" name="month" value={selectedMonth} />
            <button
              type="submit"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
            >
              Rebalance all months ({selectedYear})
            </button>
          </form>
          <ClearMonthForm
            year={selectedYear}
            month={selectedMonth}
            monthLabel={monthLabel(selectedMonth)}
            clearMonthPlan={clearMonthPlan}
            clearMonthActuals={clearMonthActuals}
          />
        </div>
      </div>

      {uploadStatus === "ok" && (
        <p className="rounded-lg border border-slate-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          CSV uploaded and data updated.
        </p>
      )}
      {uploadStatus === "error" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Upload failed. Please select a file and try again.
        </p>
      )}
      {uploadStatus === "empty" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          CSV file is empty or has no data rows.
        </p>
      )}
      {uploadStatus === "format" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          CSV must have headers: Category, Type, and Plan and/or Actual.
        </p>
      )}
      {uploadStatus === "backup_ok" && (
        <p className="rounded-lg border border-slate-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          Full backup CSV restored successfully (settings, categories, plans, actuals, and allocations).
        </p>
      )}
      {uploadStatus === "backup_format" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Backup CSV format is invalid. Please upload a file downloaded from Full Backup export.
        </p>
      )}
      {uploadStatus === "backup_unavailable" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Allocation tables are unavailable in this server instance. Restart dev server and retry backup restore.
        </p>
      )}
      {uploadStatus === "backup_error" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Backup restore failed. Please choose a backup CSV file and try again.
        </p>
      )}
      {cleared === "plan" && (
        <p className="rounded-lg border border-slate-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Plan for this month has been cleared.
        </p>
      )}
      {cleared === "actuals" && (
        <p className="rounded-lg border border-slate-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Actuals for this month have been cleared.
        </p>
      )}
      {planRebalanced && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${
          rebalancedResidualDeficit > 0.0001
            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
        }`}>
          Planned cashflow was auto-rebalanced by reducing {rebalancedCount} category plan{rebalancedCount === 1 ? "" : "s"} totaling {rebalancedCut.toFixed(2)}.
          {rebalancedResidualDeficit > 0.0001
            ? ` Remaining planned deficit: ${rebalancedResidualDeficit.toFixed(2)}. Add more eligible categories, reduce minimums, or adjust income.`
            : ""}
        </p>
      )}
      {planRebalancedRun && planRebalancedNoChange && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200">
          Rebalance completed. Planned cashflow was already non-negative, so no category reductions were applied.
        </p>
      )}
      {bulkRebalanced && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${
          bulkRebalancedUnresolvedMonths > 0
            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
        }`}>
          Rebalanced all month plans for {selectedYear}: processed {bulkRebalancedMonths} month{bulkRebalancedMonths === 1 ? "" : "s"}, applied cuts in {bulkRebalancedCutMonths} month{bulkRebalancedCutMonths === 1 ? "" : "s"}, total cut {bulkRebalancedTotalCut.toFixed(2)}.
          {bulkRebalancedUnresolvedMonths > 0
            ? ` ${bulkRebalancedUnresolvedMonths} month${bulkRebalancedUnresolvedMonths === 1 ? "" : "s"} still have negative planned cashflow after rebalancing.`
            : ""}
        </p>
      )}
      {allocStatus === "created" && (
        <p className="rounded-lg border border-slate-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          Allocation line added.
        </p>
      )}
      {allocStatus === "deleted" && (
        <p className="rounded-lg border border-slate-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Allocation line deleted.
        </p>
      )}
      {allocStatus === "updated" && (
        <p className="rounded-lg border border-slate-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          Allocation line updated.
        </p>
      )}
      {allocStatus === "overflow" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Allocation exceeds actual amount for that category/month.
        </p>
      )}
      {allocStatus === "noactual" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Enter the category actual amount first before adding allocations.
        </p>
      )}
      {allocStatus === "invalid" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Invalid allocation input. Check amount/type/duration and try again.
        </p>
      )}
      {allocStatus === "unavailable" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          Allocation feature needs a dev server restart to load the new Prisma client.
        </p>
      )}

      <PersistentDetails
        storageKey="entries-allocation-editor"
        defaultOpen={false}
        openOverride={Boolean(allocationBeingEdited)}
        className="order-last rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800"
        summary={
          <div className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                Expense Allocations For Recognized View
              </h2>
              <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-300">
                Secondary step. Use after saving monthly actuals in the main table.
              </p>
            </div>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
              Expand
            </span>
          </div>
          </div>
        }
      >
        <div className="mt-4 space-y-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
              Allocation editor
            </h2>
            {allocationBeingEdited && (
              <a
                href={`/entries?year=${selectedYear}&month=${selectedMonth}#allocation-editor`}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Cancel edit
              </a>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-300">
            {allocationBeingEdited
              ? "Edit an allocation line and save the changes."
              : "Split a paid expense into multiple lines: immediate, quarterly, annual, or custom months."}
          </p>
        </div>

        <form
          action={allocationBeingEdited ? updateExpenseAllocation : addExpenseAllocation}
          className="grid gap-3 md:grid-cols-8"
        >
          {allocationBeingEdited && (
            <input type="hidden" name="id" value={allocationBeingEdited.id} />
          )}
          <input type="hidden" name="year" value={selectedYear} />
          <input type="hidden" name="month" value={selectedMonth} />
          <select
            name="categoryId"
            required
            defaultValue={allocationBeingEdited ? String(allocationBeingEdited.categoryId) : ""}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 md:col-span-2"
          >
            <option value="" disabled>
              Expense category
            </option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            name="allocationAmount"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="Amount"
            defaultValue={allocationBeingEdited ? Number(allocationBeingEdited.amount) : ""}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <select
            name="allocationType"
            defaultValue={allocationBeingEdited?.type ?? "IMMEDIATE"}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="IMMEDIATE">Immediate</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUAL">Annual</option>
            <option value="CUSTOM">Custom</option>
          </select>
          <select
            name="allocationNeedTier"
            defaultValue={allocationBeingEdited?.needTier ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="">Tier (optional)</option>
            <option value="ESSENTIAL">Essential</option>
            <option value="NON_ESSENTIAL">Non-essential</option>
            <option value="TRAVEL">Travel</option>
            <option value="LUXURY">Luxury</option>
          </select>
          <input
            name="customDuration"
            type="number"
            min="1"
            max="120"
            placeholder="Custom months"
            defaultValue={
              allocationBeingEdited?.type === "CUSTOM"
                ? (allocationBeingEdited.durationMonths ?? "")
                : ""
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <input
            name="recognitionStartYear"
            type="number"
            min="2000"
            max="2100"
            defaultValue={allocationBeingEdited?.recognitionStartYear ?? selectedYear}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <select
            name="recognitionStartMonth"
            defaultValue={allocationBeingEdited?.recognitionStartMonth ?? selectedMonth}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={`alloc-start-${m}`} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-[var(--brand-primary-hover)] px-3 py-2 text-xs font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            {allocationBeingEdited ? "Save changes" : "Add allocation"}
          </button>
          <input
            name="allocationNotes"
            placeholder="Notes (optional)"
            defaultValue={allocationBeingEdited?.notes ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 md:col-span-7"
          />
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Start</th>
                <th className="px-3 py-2 text-left">Tier</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Recognized/mo</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {monthAllocations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-slate-700 dark:text-slate-300">
                    No allocation lines for this month yet.
                  </td>
                </tr>
              ) : (
                monthAllocations.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                  >
                    <td className="px-3 py-2">{a.category.name}</td>
                    <td className="px-3 py-2">
                      {a.type === "CUSTOM"
                        ? `custom (${durationMonthsForAllocation(a.type, a.durationMonths)}m)`
                        : a.type.toLowerCase()}
                    </td>
                    <td className="px-3 py-2">
                      {a.recognitionStartYear && a.recognitionStartMonth
                        ? `${monthLabel(a.recognitionStartMonth)} ${a.recognitionStartYear}`
                        : a.startMode === "THIS_MONTH"
                          ? "This month"
                          : "Next month"}
                    </td>
                    <td className="px-3 py-2">
                      {a.needTier === "ESSENTIAL"
                        ? "Essential"
                        : a.needTier === "NON_ESSENTIAL"
                          ? "Non-essential"
                          : a.needTier === "TRAVEL"
                            ? "Travel"
                          : a.needTier === "LUXURY"
                            ? "Luxury"
                            : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{Number(a.amount).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      {allocationContributionPerMonth({
                        id: a.id,
                        year: a.year,
                        month: a.month,
                        categoryId: a.categoryId,
                        amount: Number(a.amount),
                        type: a.type,
                        durationMonths: a.durationMonths,
                        startMode: a.startMode,
                        recognitionStartYear: a.recognitionStartYear,
                        recognitionStartMonth: a.recognitionStartMonth,
                        needTier: a.needTier,
                      }).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{a.notes ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <a
                          href={`/entries?year=${selectedYear}&month=${selectedMonth}&allocEditId=${a.id}#allocation-editor`}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                        >
                          Edit
                        </a>
                        <form action={deleteExpenseAllocation}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="year" value={selectedYear} />
                          <input type="hidden" name="month" value={selectedMonth} />
                          <button
                            type="submit"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">Expense category</th>
                <th className="px-3 py-2 text-right">Actual paid</th>
                <th className="px-3 py-2 text-right">Allocated</th>
                <th className="px-3 py-2 text-right">Unallocated (immediate)</th>
                <th className="px-3 py-2 text-right">Recognized this month</th>
              </tr>
            </thead>
            <tbody>
              {expenseCategories.map((c) => {
                const actual = Number(existingByCategory.get(c.id)?.amount ?? 0);
                const allocated = (allocationByCategory.get(c.id) ?? []).reduce(
                  (s, a) => s + Number(a.amount),
                  0,
                );
                const recognized = recognizedExpenseForCategoryMonth({
                  year: selectedYear,
                  month: selectedMonth,
                  categoryId: c.id,
                  actualAmount: actual,
                  allocatedPaidMonthByCategory,
                  recognizedContributionByCategoryMonth,
                });
                const diff = recognized - actual;
                const hasDiff = Math.abs(diff) > 0.0001;
                if (!actual && !allocated && !recognized) return null;
                return (
                  <tr
                    key={`alloc-summary-${c.id}`}
                    className={`border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300 ${
                      hasDiff
                        ? "bg-amber-50/60 dark:bg-amber-900/10"
                        : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{c.name}</span>
                        {hasDiff && (
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{actual.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{allocated.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{(actual - allocated).toFixed(2)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        hasDiff
                          ? "text-amber-900 dark:text-amber-200"
                          : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {recognized.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      </PersistentDetails>

      <PersistentDetails
        storageKey="entries-csv-tools"
        defaultOpen={false}
        className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-600 dark:bg-slate-800/70"
        summary={
          <div className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                CSV Tools
              </h2>
              <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                Import or export monthly plan/actual data.
              </p>
            </div>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
              Expand
            </span>
          </div>
          </div>
        }
      >
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300">
              Download
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/entries/export?year=${selectedYear}&month=${selectedMonth}&mode=both`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                download
              >
                Plan &amp; Actuals
              </a>
              <a
                href={`/api/entries/export?year=${selectedYear}&month=${selectedMonth}&mode=plan`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                download
              >
                Plan Only
              </a>
              <a
                href={`/api/entries/export?year=${selectedYear}&month=${selectedMonth}&mode=actual`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                download
              >
                Actuals Only
              </a>
              <a
                href="/api/backup/export"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
                download
              >
                Full Backup (All Data)
              </a>
            </div>
          </div>

          <div className="grid gap-3">
            <form
              action={uploadEntriesCsv}
              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800"
            >
              <input type="hidden" name="year" value={selectedYear} />
              <input type="hidden" name="month" value={selectedMonth} />
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300">
                Upload Monthly CSV
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  name="csvFile"
                  accept=".csv,text/csv"
                  required
                  className="block text-xs text-slate-700 file:mr-2 file:rounded-lg file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-slate-700 dark:file:border-slate-600 dark:file:bg-slate-700 dark:file:text-slate-200 dark:text-slate-300"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--brand-primary-hover)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  style={{ backgroundColor: "var(--brand-primary)" }}
                >
                  Upload CSV
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                Headers: Category, Type, Plan and/or Actual.
              </p>
            </form>

            <form
              action={uploadFullBackupCsv}
              className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-700 dark:bg-emerald-900/10"
            >
              <input type="hidden" name="year" value={selectedYear} />
              <input type="hidden" name="month" value={selectedMonth} />
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                Restore Full Backup CSV
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  name="backupCsvFile"
                  accept=".csv,text/csv"
                  required
                  className="block text-xs text-slate-700 file:mr-2 file:rounded-lg file:border file:border-emerald-200 file:bg-white file:px-3 file:py-1.5 file:text-emerald-900 dark:file:border-emerald-700 dark:file:bg-slate-800 dark:file:text-emerald-200 dark:text-slate-300"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 dark:border-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  Restore Backup
                </button>
              </div>
              <p className="mt-1 text-[11px] text-emerald-900 dark:text-emerald-200">
                Replaces current settings, categories, plans, actuals, and allocations with the uploaded backup.
              </p>
            </form>
          </div>
        </div>
      </PersistentDetails>

      <form
        action={saveEntries}
        id={entriesFormId}
        className="space-y-4"
        key={entriesFormId}
      >
        <input type="hidden" name="year" value={selectedYear} />
        <input type="hidden" name="month" value={selectedMonth} />
        <EntriesDraftAutosave
          formId={entriesFormId}
          year={selectedYear}
          month={selectedMonth}
        />
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Plan</th>
                <th className="px-4 py-2 text-right">Rebalanced plan</th>
                <th className="px-4 py-2 text-right">Actual</th>
              </tr>
            </thead>
            <tbody>
              {(["INCOME", "EXPENSE", "INVESTMENT"] as const).map((type) => {
                const groupCategories = categories.filter(
                  (c) => c.type === type,
                );
                if (!groupCategories.length) return null;

                const groupLabel =
                  type === "INCOME"
                    ? "Income"
                    : type === "INVESTMENT"
                    ? "Investments"
                    : "Expenses";

                return (
                  <CollapsibleTableGroup
                    key={type}
                    title={groupLabel}
                    colSpan={4}
                  >
                    {groupCategories.map((category) => {
                      const existing = existingByCategory.get(category.id);
                      const existingBudget = budgetByCategory.get(category.id);
                      const defaultActual =
                        existing && existing.amount != null
                          ? Number(existing.amount).toString()
                          : "";
                      const defaultBudget =
                        existingBudget && existingBudget.amount != null
                          ? Number(existingBudget.amount).toString()
                          : "";
                      const defaultRebalancedBudget =
                        existingBudget &&
                        (existingBudget as { rebalancedAmount?: unknown }).rebalancedAmount != null
                          ? Number(
                              (existingBudget as { rebalancedAmount?: unknown }).rebalancedAmount,
                            ).toString()
                          : "";

                      return (
                        <tr
                          key={category.id}
                          className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                        >
                          <td className="px-4 py-2">
                            <span className="text-sm dark:text-slate-200">{category.name}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              name={`budget-${category.id}`}
                              defaultValue={defaultBudget}
                              inputMode="decimal"
                              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-xs text-slate-900 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-cyan-500/50 dark:focus:ring-cyan-500/30"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span
                              className={`inline-block min-w-24 rounded-lg border px-2 py-1.5 text-right text-xs ${
                                defaultRebalancedBudget
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200"
                                  : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
                              }`}
                              title="Comparisons use the rebalanced plan when present"
                            >
                              {defaultRebalancedBudget || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              name={`amount-${category.id}`}
                              defaultValue={defaultActual}
                              inputMode="decimal"
                              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-xs text-slate-900 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-cyan-500/50 dark:focus:ring-cyan-500/30"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </CollapsibleTableGroup>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="submit"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            Save plan/actual
          </button>
          <button
            type="submit"
            formAction={rebalanceAndSaveEntries}
            className="rounded-lg border border-[var(--brand-primary-hover)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            Rebalance plan
          </button>
        </div>
      </form>

      <EntriesFlashQueryCleanup />

      <PersistentDetails
        storageKey="entries-plan-summary"
        defaultOpen={false}
        className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-slate-800"
        summary={
          <div className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Plan Summary
              </p>
              <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                Original plan vs rebalanced plan totals for this month.
              </p>
            </div>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
              Expand
            </span>
          </div>
          </div>
        }
      >
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">Metric</th>
                <th className="px-3 py-2 text-right">Original plan</th>
                <th className="px-3 py-2 text-right">Rebalanced plan</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 dark:border-slate-600">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">Income</td>
                <td className="px-3 py-2 text-right tabular-nums">{budgetTotals.incomePlan.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{budgetTotals.incomeRebalanced.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-600">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">Expenses</td>
                <td className="px-3 py-2 text-right tabular-nums">{budgetTotals.expensePlan.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{budgetTotals.expenseRebalanced.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-600">
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">Investments</td>
                <td className="px-3 py-2 text-right tabular-nums">{budgetTotals.investmentPlan.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{budgetTotals.investmentRebalanced.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-slate-500 dark:bg-slate-700/40">
                <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">Cashflow</td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${
                    plannedCashflow < 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {plannedCashflow.toFixed(2)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${
                    rebalancedPlannedCashflow < 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {rebalancedPlannedCashflow.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-700 dark:text-slate-300">
            Dashboard comparisons use the rebalanced plan when available.
          </p>
        </div>
      </PersistentDetails>
    </div>
  );
}
