import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { YearSelector } from "./YearSelector";
import { DashboardPeriodSelector } from "./DashboardPeriodSelector";
import { DashboardProgressBar } from "./DashboardProgressBar";
import { DashboardProgressCharts } from "./DashboardProgressCharts";
import { DashboardWaterfallChart } from "./DashboardWaterfallChart";
import { DashboardTrendLineChart } from "./DashboardTrendLineChart";
import { PulseExportActions } from "./PulseExportActions";
import { PulseReportDocument } from "./PulseReportDocument";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PersistentDetails } from "@/components/PersistentDetails";
import {
  Activity,
  CalendarRange,
  Lightbulb,
  Layers3,
  Table2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  DashboardCategoryTotalsTable,
  type CategoryTotalRow,
} from "./DashboardCategoryTotalsTable";
import {
  buildAllocationMaps,
  durationMonthsForAllocation,
  recognizedExpenseForCategoryMonth,
} from "@/lib/expenseAllocations";

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
          }>
        >;
      };
    }
  ).expenseAllocation;
}

type SummaryMonth = {
  month: number;
  income: number;
  expensesActual: number;
  expensesRecognized: number;
  investments: number;
  investmentsFundedFromInvestable: number;
  investmentsFundedFromCashflow: number;
  netActual: number;
  netOperationalActual: number;
  netRecognized: number;
  netOperationalRecognized: number;
  balance: number;
  budgetIncome: number;
  budgetExpenses: number;
  budgetInvestments: number;
  budgetNet: number;
};

type DashboardInsight = {
  id: string;
  severity: "info" | "warn" | "good";
  score: number;
  title: string;
  detail: string;
  recommendation?: string;
};

function monthLabel(m: number) {
  return new Date(2000, m - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
}

function monthIndex(year: number, month: number) {
  return year * 12 + (month - 1);
}

function fromMonthIndex(idx: number) {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function allocationStartMonthIndex(a: {
  year: number;
  month: number;
  startMode: "THIS_MONTH" | "NEXT_MONTH";
  recognitionStartYear: number | null;
  recognitionStartMonth: number | null;
}) {
  if (a.recognitionStartYear != null && a.recognitionStartMonth != null) {
    return monthIndex(a.recognitionStartYear, a.recognitionStartMonth);
  }
  return monthIndex(a.year, a.month) + (a.startMode === "NEXT_MONTH" ? 1 : 0);
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function budgetAmountForComparison(b: { amount: unknown; rebalancedAmount?: unknown | null }) {
  return round2(Number((b.rebalancedAmount ?? b.amount) ?? 0));
}

function SectionIcon({
  name,
  className = "",
}: {
  name:
    | "pulse"
    | "insights"
    | "mix"
    | "cash"
    | "investable"
    | "table"
    | "annualBudget";
  className?: string;
}) {
  const common = `h-4 w-4 ${className}`;
  if (name === "pulse") return <Activity className={common} aria-hidden />;
  if (name === "insights") return <Lightbulb className={common} aria-hidden />;
  if (name === "mix") return <Layers3 className={common} aria-hidden />;
  if (name === "cash") return <Wallet className={common} aria-hidden />;
  if (name === "investable") return <TrendingUp className={common} aria-hidden />;
  if (name === "annualBudget") return <CalendarRange className={common} aria-hidden />;
  return <Table2 className={common} aria-hidden />;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    view?: string;
    month?: string;
    monthFrom?: string;
    monthTo?: string;
    hideEmpty?: string;
    report?: string;
    autoprint?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const allocationDelegate = getExpenseAllocationDelegate();
  const allocationsAvailable = Boolean(allocationDelegate);

  const [firstEntry, firstBudget, firstAllocation] = await Promise.all([
    prisma.monthlyEntry.findFirst({
      select: { year: true, month: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.budgetEntry.findFirst({
      select: { year: true, month: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    allocationDelegate
      ? allocationDelegate.findMany({
          select: { year: true, month: true } as never,
          orderBy: [{ year: "asc" }, { month: "asc" }] as never,
          take: 1 as never,
        } as never).then((rows: Array<{ year: number; month: number }>) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  const earliestCandidates = [firstEntry, firstBudget, firstAllocation].filter(
    (r): r is { year: number; month: number } => Boolean(r),
  );
  const earliestData = earliestCandidates.sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  )[0] ?? { year: currentYear, month: currentMonth };

  const minSelectableYear = earliestData.year;
  const maxSelectableYear = currentYear;
  const rawYear = params?.year ? Number(params.year) : currentYear;
  const year = Math.min(maxSelectableYear, Math.max(minSelectableYear, rawYear));
  const minMonthForSelectedYear = year === minSelectableYear ? earliestData.month : 1;
  const maxMonthForSelectedYear = year === maxSelectableYear ? currentMonth : 12;
  const allowedMonthsForYear = Array.from(
    { length: Math.max(0, maxMonthForSelectedYear - minMonthForSelectedYear + 1) },
    (_, i) => minMonthForSelectedYear + i,
  );
  const view = (params?.view as "full" | "month" | "ytd" | "range") || "month";
  const fallbackMonth = allowedMonthsForYear.includes(currentMonth)
    ? currentMonth
    : allowedMonthsForYear[allowedMonthsForYear.length - 1] ?? minMonthForSelectedYear;
  const rawMonthParam = params?.month ? Number(params.month) : fallbackMonth;
  const rawMonthFrom = params?.monthFrom ? Number(params.monthFrom) : minMonthForSelectedYear;
  const rawMonthTo = params?.monthTo ? Number(params.monthTo) : maxMonthForSelectedYear;
  const clampMonthForYear = (m: number) =>
    Math.min(maxMonthForSelectedYear, Math.max(minMonthForSelectedYear, m));
  const monthParam = clampMonthForYear(rawMonthParam);
  const monthFrom = clampMonthForYear(rawMonthFrom);
  const monthTo = clampMonthForYear(rawMonthTo);
  const hideEmpty = params?.hideEmpty === "1";
  const isReportMode = params?.report === "1";
  const autoPrintReport = params?.autoprint === "1";

  // Months in scope for the selected period
  const from = view === "range" ? Math.min(monthFrom, monthTo) : minMonthForSelectedYear;
  const to =
    view === "range"
      ? Math.max(monthFrom, monthTo)
      : view === "ytd"
        ? monthParam
        : view === "month"
          ? monthParam
          : maxMonthForSelectedYear;
  const monthsInScope: number[] =
    view === "full"
      ? Array.from(
          { length: Math.max(0, maxMonthForSelectedYear - minMonthForSelectedYear + 1) },
          (_, i) => minMonthForSelectedYear + i,
        )
      : view === "month"
        ? [monthParam]
        : Array.from(
            { length: Math.max(0, to - from + 1) },
            (_, i) => from + i,
          ).filter((m) => m >= 1 && m <= 12);

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      initialBalance: 0,
      openingInvestableBalance: 0,
      currency: "USD",
    },
  });

  const [entries, entriesPrevYear, budgets, categories, expenseAllocations] = await Promise.all([
    prisma.monthlyEntry.findMany({
      where: { year },
      include: { category: true },
      orderBy: [{ month: "asc" }, { categoryId: "asc" }],
    }),
    prisma.monthlyEntry.findMany({
      where: { year: year - 1 },
      include: { category: true },
      orderBy: [{ month: "asc" }, { categoryId: "asc" }],
    }),
    prisma.budgetEntry.findMany({
      where: { year },
      include: { category: true },
      orderBy: [{ month: "asc" }, { categoryId: "asc" }],
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    allocationDelegate ? allocationDelegate.findMany({}) : Promise.resolve([]),
  ]);
  const { allocatedPaidMonthByCategory, recognizedContributionByCategoryMonth } =
    buildAllocationMaps(
      expenseAllocations.map((a) => ({
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
  const expenseCategoryIds = categories
    .filter((c) => c.type === "EXPENSE")
    .map((c) => c.id);
  const categoryDefaultTierById = new Map(
    categories
      .filter((c) => c.type === "EXPENSE")
      .map((c) => [c.id, c.defaultNeedTier ?? "ESSENTIAL"]),
  );

  const months: SummaryMonth[] = [];
  let runningBalance = Number(settings.initialBalance);

  for (let m = 1; m <= 12; m += 1) {
    const monthEntries = entries.filter((e) => e.month === m);
    const monthBudgets = budgets.filter((b) => b.month === m);

    const income = monthEntries
      .filter((e) => e.category.type === "INCOME")
      .reduce((sum, e) => round2(sum + Number(e.amount)), 0);
    const actualExpenses = monthEntries
      .filter((e) => e.category.type === "EXPENSE")
      .reduce((sum, e) => round2(sum + Number(e.amount)), 0);
    const recognizedExpenses = expenseCategoryIds.reduce((sum, categoryId) => {
      const entry = monthEntries.find((e) => e.categoryId === categoryId);
      const actualAmount = entry ? Number(entry.amount) : 0;
      return round2(
        sum +
          recognizedExpenseForCategoryMonth({
          year,
          month: m,
          categoryId,
          actualAmount,
          allocatedPaidMonthByCategory,
          recognizedContributionByCategoryMonth,
          }),
      );
    }, 0);
    const investments = monthEntries
      .filter((e) => e.category.type === "INVESTMENT")
      .reduce((sum, e) => round2(sum + Number(e.amount)), 0);

    const budgetIncome = monthBudgets
      .filter((b) => b.category.type === "INCOME")
      .reduce((sum, b) => sum + budgetAmountForComparison(b), 0);
    const budgetExpenses = monthBudgets
      .filter((b) => b.category.type === "EXPENSE")
      .reduce((sum, b) => sum + budgetAmountForComparison(b), 0);
    const budgetInvestments = monthBudgets
      .filter((b) => b.category.type === "INVESTMENT")
      .reduce((sum, b) => sum + budgetAmountForComparison(b), 0);

    const investmentExcessOverPlan = round2(Math.max(0, investments - budgetInvestments));
    const investmentsFundedFromInvestable = investmentExcessOverPlan;
    const investmentsFundedFromCashflow = round2(
      Math.max(0, investments - investmentsFundedFromInvestable),
    );
    const netActual = round2(income - actualExpenses - investments);
    const netRecognized = round2(income - recognizedExpenses - investments);
    const netOperationalActual = round2(
      income - actualExpenses - investmentsFundedFromCashflow,
    );
    const netOperationalRecognized = round2(
      income - recognizedExpenses - investmentsFundedFromCashflow,
    );
    const budgetNet = round2(budgetIncome - budgetExpenses - budgetInvestments);
    runningBalance = round2(runningBalance + netOperationalActual);

    months.push({
      month: m,
      income,
      expensesActual: actualExpenses,
      expensesRecognized: recognizedExpenses,
      investments,
      investmentsFundedFromInvestable,
      investmentsFundedFromCashflow,
      netActual,
      netOperationalActual,
      netRecognized,
      netOperationalRecognized,
      balance: runningBalance,
      budgetIncome,
      budgetExpenses,
      budgetInvestments,
      budgetNet,
    });
  }

  // Period-scoped months and totals
  const periodMonths = months.filter((m) => monthsInScope.includes(m.month));
  const totalIncome = periodMonths.reduce((sum, m) => round2(sum + m.income), 0);
  const totalExpensesActual = periodMonths.reduce((sum, m) => round2(sum + m.expensesActual), 0);
  const totalExpensesRecognized = periodMonths.reduce(
    (sum, m) => round2(sum + m.expensesRecognized),
    0,
  );
  const totalInvestments = periodMonths.reduce(
    (sum, m) => round2(sum + m.investments),
    0,
  );
  const totalInvestmentsFundedFromCashflow = periodMonths.reduce(
    (sum, m) => round2(sum + m.investmentsFundedFromCashflow),
    0,
  );
  const totalNetActual = periodMonths.reduce(
    (sum, m) => round2(sum + m.netOperationalActual),
    0,
  );
  const totalNetRecognized = periodMonths.reduce(
    (sum, m) => round2(sum + m.netOperationalRecognized),
    0,
  );
  const totalBudgetIncome = periodMonths.reduce(
    (sum, m) => sum + m.budgetIncome,
    0,
  );
  const totalBudgetExpenses = periodMonths.reduce(
    (sum, m) => sum + m.budgetExpenses,
    0,
  );
  const totalBudgetInvestments = periodMonths.reduce(
    (sum, m) => sum + m.budgetInvestments,
    0,
  );
  const totalBudgetNet = round2(
    totalBudgetIncome - totalBudgetExpenses - totalBudgetInvestments,
  );

  const tierOrder = [
    { key: "ESSENTIAL", label: "Essential" },
    { key: "NON_ESSENTIAL", label: "Non-essential" },
    { key: "TRAVEL", label: "Travel" },
    { key: "LUXURY", label: "Luxury" },
  ] as const;
  const tierKeys = tierOrder.map((t) => t.key);
  const paidAllocationTierByCategoryMonth = new Map<string, number>();
  const recognizedAllocationTierByCategoryMonth = new Map<string, number>();
  for (const a of expenseAllocations) {
    const effectiveTier =
      a.needTier ?? categoryDefaultTierById.get(a.categoryId) ?? "ESSENTIAL";
    const paidKey = `${a.year}-${a.month}-${a.categoryId}-${effectiveTier}`;
    paidAllocationTierByCategoryMonth.set(
      paidKey,
      (paidAllocationTierByCategoryMonth.get(paidKey) ?? 0) + Number(a.amount),
    );

    const duration = durationMonthsForAllocation(a.type, a.durationMonths);
    const perMonth = Number(a.amount) / duration;
    const startIdx = allocationStartMonthIndex(a);
    for (let i = 0; i < duration; i += 1) {
      const { year: y, month: m } = fromMonthIndex(startIdx + i);
      const recKey = `${y}-${m}-${a.categoryId}-${effectiveTier}`;
      recognizedAllocationTierByCategoryMonth.set(
        recKey,
        (recognizedAllocationTierByCategoryMonth.get(recKey) ?? 0) + perMonth,
      );
    }
  }

  const tierTotalsActualMap = new Map<(typeof tierKeys)[number], number>(
    tierKeys.map((k) => [k, 0]),
  );
  const tierTotalsRecognizedMap = new Map<(typeof tierKeys)[number], number>(
    tierKeys.map((k) => [k, 0]),
  );
  const periodActualTierByCategory = new Map<number, Record<string, number>>();
  const periodRecognizedTierByCategory = new Map<number, Record<string, number>>();
  for (const m of monthsInScope) {
    for (const categoryId of expenseCategoryIds) {
      const entry = entries.find((e) => e.month === m && e.categoryId === categoryId);
      const actualAmount = Number(entry?.amount ?? 0);
      const allocatedPaid = allocatedPaidMonthByCategory.get(`${year}-${m}-${categoryId}`) ?? 0;
      const remainderImmediate = actualAmount - allocatedPaid;
      const fallbackTier = categoryDefaultTierById.get(categoryId) ?? "ESSENTIAL";

      const actualTierRec = periodActualTierByCategory.get(categoryId) ?? {
        ESSENTIAL: 0,
        NON_ESSENTIAL: 0,
        TRAVEL: 0,
        LUXURY: 0,
      };
      const recognizedTierRec = periodRecognizedTierByCategory.get(categoryId) ?? {
        ESSENTIAL: 0,
        NON_ESSENTIAL: 0,
        TRAVEL: 0,
        LUXURY: 0,
      };

      for (const tierKey of tierKeys) {
        const mapKey = `${year}-${m}-${categoryId}-${tierKey}`;
        const actualTierAllocationAmount = paidAllocationTierByCategoryMonth.get(mapKey) ?? 0;
        const recognizedTierAllocationAmount =
          recognizedAllocationTierByCategoryMonth.get(mapKey) ?? 0;
        if (actualTierAllocationAmount) {
          tierTotalsActualMap.set(
            tierKey,
            (tierTotalsActualMap.get(tierKey) ?? 0) + actualTierAllocationAmount,
          );
          actualTierRec[tierKey] = (actualTierRec[tierKey] ?? 0) + actualTierAllocationAmount;
        }
        if (recognizedTierAllocationAmount) {
          tierTotalsRecognizedMap.set(
            tierKey,
            (tierTotalsRecognizedMap.get(tierKey) ?? 0) + recognizedTierAllocationAmount,
          );
          recognizedTierRec[tierKey] =
            (recognizedTierRec[tierKey] ?? 0) + recognizedTierAllocationAmount;
        }
      }

      if (Math.abs(remainderImmediate) > 0.0001) {
        tierTotalsActualMap.set(
          fallbackTier,
          (tierTotalsActualMap.get(fallbackTier) ?? 0) + remainderImmediate,
        );
        tierTotalsRecognizedMap.set(
          fallbackTier,
          (tierTotalsRecognizedMap.get(fallbackTier) ?? 0) + remainderImmediate,
        );
        actualTierRec[fallbackTier] = (actualTierRec[fallbackTier] ?? 0) + remainderImmediate;
        recognizedTierRec[fallbackTier] =
          (recognizedTierRec[fallbackTier] ?? 0) + remainderImmediate;
      }
      periodActualTierByCategory.set(categoryId, actualTierRec);
      periodRecognizedTierByCategory.set(categoryId, recognizedTierRec);
    }
  }

  const tierTotalsActual = tierOrder.map((tier) => ({
    ...tier,
    amount: tierTotalsActualMap.get(tier.key) ?? 0,
  }));
  const tierTotalsRecognized = tierOrder.map((tier) => ({
    ...tier,
    amount: tierTotalsRecognizedMap.get(tier.key) ?? 0,
  }));

  const currency = settings.currency || "USD";
  const ytdEndMonth = Math.max(1, Math.min(12, monthParam));
  const ytdMonths = months.filter((m) => m.month >= 1 && m.month <= ytdEndMonth);
  const ytdCount = Math.max(1, ytdMonths.length);
  const ytdAvgIncome = ytdMonths.reduce((s, m) => s + m.income, 0) / ytdCount;
  const ytdAvgExpensesActual =
    ytdMonths.reduce((s, m) => s + m.expensesActual, 0) / ytdCount;
  const ytdAvgExpensesRecognized =
    ytdMonths.reduce((s, m) => s + m.expensesRecognized, 0) / ytdCount;
  const ytdAvgInvestments =
    ytdMonths.reduce((s, m) => s + m.investments, 0) / ytdCount;
  const ytdAvgNetActual =
    ytdMonths.reduce((s, m) => s + m.netOperationalActual, 0) / ytdCount;
  const ytdAvgNetRecognized =
    ytdMonths.reduce((s, m) => s + m.netOperationalRecognized, 0) / ytdCount;

  const endBalance = periodMonths.length
    ? periodMonths[periodMonths.length - 1].balance
    : Number(settings.initialBalance);

  const firstMonthInScope = monthsInScope[0] ?? 1;
  const startingBalanceForPeriod =
    firstMonthInScope === 1
      ? Number(settings.initialBalance)
      : Number(
          months.find((m) => m.month === firstMonthInScope - 1)?.balance ??
            settings.initialBalance,
        );
  const openingInvestableBalance = Number(settings.openingInvestableBalance ?? 0);
  const investableUsedBeforePeriod = months
    .filter((m) => m.month < firstMonthInScope)
    .reduce((s, m) => s + m.investmentsFundedFromInvestable, 0);
  const investableUsedInPeriod = periodMonths.reduce(
    (s, m) => s + m.investmentsFundedFromInvestable,
    0,
  );
  const startingInvestableBalanceForPeriod =
    openingInvestableBalance - investableUsedBeforePeriod;
  const endInvestableBalanceForPeriod =
    startingInvestableBalanceForPeriod - investableUsedInPeriod;

  // Previous period (same length, immediately before current period) for trends
  const len = monthsInScope.length;
  const prevPeriodMonths: { year: number; month: number }[] = [];
  for (let i = 0; i < len; i++) {
    let m = monthsInScope[0] - 1 - i;
    let y = year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    prevPeriodMonths.unshift({ year: y, month: m });
  }

  const prevPeriodEntries = prevPeriodMonths.flatMap(({ year: y, month: m }) =>
    (y === year ? entries : entriesPrevYear)
      .filter((e) => e.month === m)
      .map((e) => ({ ...e, year: y, month: m })),
  );

  let prevIncome = 0;
  let prevExpenses = 0;
  let prevInvestments = 0;
  const prevActualByCategory = new Map<number, number>();
  for (const e of prevPeriodEntries) {
    const amt = Number(e.amount);
    if (e.category.type === "INCOME") prevIncome += amt;
    else if (e.category.type === "EXPENSE") prevExpenses += amt;
    else if (e.category.type === "INVESTMENT") prevInvestments += amt;
    prevActualByCategory.set(
      e.categoryId,
      (prevActualByCategory.get(e.categoryId) ?? 0) + amt,
    );
  }
  const prevNet = prevIncome - prevExpenses - prevInvestments;

  // December of previous year totals (for trend chart "previous month" when current is January)
  const prevYearDecEntries = entriesPrevYear.filter((e) => e.month === 12);
  const prevYearDecemberTotals: {
    income: number;
    expenses: number;
    investments: number;
    net: number;
  } = {
    income: prevYearDecEntries
      .filter((e) => e.category.type === "INCOME")
      .reduce((s, e) => s + Number(e.amount), 0),
    expenses: prevYearDecEntries
      .filter((e) => e.category.type === "EXPENSE")
      .reduce((s, e) => s + Number(e.amount), 0),
    investments: prevYearDecEntries
      .filter((e) => e.category.type === "INVESTMENT")
      .reduce((s, e) => s + Number(e.amount), 0),
    net: 0,
  };
  prevYearDecemberTotals.net =
    prevYearDecemberTotals.income -
    prevYearDecemberTotals.expenses -
    prevYearDecemberTotals.investments;
  // Trend chart: current month values + previous calendar month (for tooltip and % change)
  const showTrendChart = view !== "month" && periodMonths.length > 1;
  const showMultiMonthCharts = view !== "month";
  const trendLineData = showTrendChart
    ? periodMonths.map((m) => {
        const prev =
          m.month === 1
            ? prevYearDecemberTotals
            : months.find((mo) => mo.month === m.month - 1);
        return {
          month: monthLabel(m.month),
          income: m.income,
          expenses: m.expensesActual,
          investments: m.investments,
          net: m.netOperationalActual,
          prevIncome: prev?.income ?? null,
          prevExpenses:
            prev == null
              ? null
              : "expensesActual" in prev
                ? prev.expensesActual
                : prev.expenses,
          prevInvestments: prev?.investments ?? null,
          prevNet:
            prev == null
              ? null
              : "netActual" in prev
                ? prev.netOperationalActual
                : prev.net,
        };
      })
    : [];

  // Category-level totals for the period only (for category table and hideEmpty)
  const cashActualTotalsByCategory = new Map<number, number>();
  const recognizedTotalsByCategory = new Map<number, number>();
  const budgetTotalsByCategory = new Map<number, number>();
  for (const entry of entries) {
    if (!monthsInScope.includes(entry.month)) continue;
    cashActualTotalsByCategory.set(
      entry.categoryId,
      (cashActualTotalsByCategory.get(entry.categoryId) ?? 0) + Number(entry.amount),
    );
  }
  for (const b of budgets) {
    if (!monthsInScope.includes(b.month)) continue;
    const prev = budgetTotalsByCategory.get(b.categoryId) ?? 0;
    budgetTotalsByCategory.set(b.categoryId, prev + budgetAmountForComparison(b));
  }
  for (const m of monthsInScope) {
    for (const categoryId of expenseCategoryIds) {
      const e = entries.find((row) => row.month === m && row.categoryId === categoryId);
      const actualAmount = e ? Number(e.amount) : 0;
      const recognized = recognizedExpenseForCategoryMonth({
        year,
        month: m,
        categoryId,
        actualAmount,
        allocatedPaidMonthByCategory,
        recognizedContributionByCategoryMonth,
      });
      if (!recognized) continue;
      recognizedTotalsByCategory.set(
        categoryId,
        (recognizedTotalsByCategory.get(categoryId) ?? 0) + recognized,
      );
    }
  }

  const categoriesForDisplay = hideEmpty
    ? categories.filter(
        (c) =>
          (cashActualTotalsByCategory.get(c.id) ?? 0) > 0 ||
          (recognizedTotalsByCategory.get(c.id) ?? 0) > 0,
      )
    : categories;

  const periodEndMonth = Math.max(...monthsInScope);
  const annualBudgetRemainingRows = categories
    .filter((c) => c.type === "EXPENSE" && c.trackAnnualBudgetRemaining)
    .map((c) => {
      const annualBudget = budgets
        .filter((b) => b.categoryId === c.id)
        .reduce((sum, b) => sum + budgetAmountForComparison(b), 0);
      const spentActualYtd = entries
        .filter(
          (e) =>
            e.categoryId === c.id &&
            e.month >= 1 &&
            e.month <= periodEndMonth,
        )
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const spentRecognizedYtd = Array.from(
        { length: periodEndMonth },
        (_, i) => i + 1,
      ).reduce((sum, m) => {
        const entry = entries.find((e) => e.month === m && e.categoryId === c.id);
        const actualAmount = Number(entry?.amount ?? 0);
        return (
          sum +
          recognizedExpenseForCategoryMonth({
            year,
            month: m,
            categoryId: c.id,
            actualAmount,
            allocatedPaidMonthByCategory,
            recognizedContributionByCategoryMonth,
          })
        );
      }, 0);

      return {
        categoryId: c.id,
        categoryName: c.name,
        annualBudget,
        spentActualYtd,
        spentRecognizedYtd,
        remainingActual: annualBudget - spentActualYtd,
        remainingRecognized: annualBudget - spentRecognizedYtd,
      };
    })
    .filter(
      (row) =>
        row.annualBudget !== 0 ||
        row.spentActualYtd !== 0 ||
        row.spentRecognizedYtd !== 0,
    );

  const categoryTotalsRows: CategoryTotalRow[] = categoriesForDisplay
    .filter(
      (c) =>
        c.type === "INCOME" || c.type === "EXPENSE" || c.type === "INVESTMENT",
    )
    .map(
    (c) => ({
      ...(function () {
        const recognizedTotal = recognizedTotalsByCategory.get(c.id) ?? 0;
        const actualTotal = cashActualTotalsByCategory.get(c.id) ?? 0;
        const recognizedTierSplit = periodRecognizedTierByCategory.get(c.id);
        const actualTierSplit = periodActualTierByCategory.get(c.id);
        const baseTotal =
          c.type === "EXPENSE"
            ? recognizedTotal > 0.0001
              ? recognizedTotal
              : actualTotal
            : 0;
        const split =
          c.type === "EXPENSE"
            ? recognizedTotal > 0.0001
              ? recognizedTierSplit
              : actualTierSplit
            : undefined;
        const nonEssentialAmt = split?.NON_ESSENTIAL ?? 0;
        const travelAmt = split?.TRAVEL ?? 0;
        const luxuryAmt = split?.LUXURY ?? 0;
        const eps = 0.0001;
        const needTierFlags =
          c.type !== "EXPENSE" || baseTotal <= eps
            ? undefined
            : {
                nonEssential:
                  nonEssentialAmt <= eps
                    ? undefined
                    : Math.abs(nonEssentialAmt - baseTotal) <= eps
                      ? ("full" as const)
                      : ("partial" as const),
                travel:
                  travelAmt <= eps
                    ? undefined
                    : Math.abs(travelAmt - baseTotal) <= eps
                      ? ("full" as const)
                      : ("partial" as const),
                luxury:
                  luxuryAmt <= eps
                    ? undefined
                    : Math.abs(luxuryAmt - baseTotal) <= eps
                      ? ("full" as const)
                      : ("partial" as const),
              };
        return { needTierFlags };
      })(),
      categoryId: c.id,
      categoryName: c.name,
      type: c.type as CategoryTotalRow["type"],
      plan: budgetTotalsByCategory.get(c.id) ?? 0,
      actual: cashActualTotalsByCategory.get(c.id) ?? 0,
      recognized:
        c.type === "EXPENSE"
          ? recognizedTotalsByCategory.get(c.id) ?? 0
          : cashActualTotalsByCategory.get(c.id) ?? 0,
      prevActual: prevActualByCategory.get(c.id) ?? 0,
      cashActual: cashActualTotalsByCategory.get(c.id) ?? 0,
      recognizedDelta:
        c.type === "EXPENSE"
          ? (recognizedTotalsByCategory.get(c.id) ?? 0) -
            (cashActualTotalsByCategory.get(c.id) ?? 0)
          : 0,
    }),
  );

  function trendPct(current: number, previous: number): string | null {
    if (previous === 0) return current === 0 ? null : "new";
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (pct === 0) return "0%";
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  }

  const periodLabel =
    view === "full"
      ? `${year} full year`
      : view === "month"
        ? `${monthLabel(monthParam)} ${year}`
        : view === "ytd"
          ? `${year} YTD (Jan – ${monthLabel(monthParam)})`
        : `${monthLabel(monthFrom)} – ${monthLabel(monthTo)} ${year}`;
  const exportFilenameBase = `pulse-${view}-${year}${
    view === "month"
      ? `-${String(monthParam).padStart(2, "0")}`
      : view === "range"
        ? `-${String(Math.min(monthFrom, monthTo)).padStart(2, "0")}-to-${String(
            Math.max(monthFrom, monthTo),
          ).padStart(2, "0")}`
        : ""
  }`;
  const reportQuery = new URLSearchParams({
    year: String(year),
    view,
    report: "1",
  });
  if (view === "month" || view === "ytd") {
    reportQuery.set("month", String(monthParam));
  }
  if (view === "range") {
    reportQuery.set("monthFrom", String(Math.min(monthFrom, monthTo)));
    reportQuery.set("monthTo", String(Math.max(monthFrom, monthTo)));
  }
  if (hideEmpty) {
    reportQuery.set("hideEmpty", "1");
  }
  const pulsePdfHref = `/api/pulse-report/pdf?${reportQuery.toString()}`;

  const insights: DashboardInsight[] = [];
  const pushInsight = (insight: DashboardInsight | null) => {
    if (insight) insights.push(insight);
  };

  const expenseGap = totalExpensesActual - totalExpensesRecognized;
  if (Math.abs(expenseGap) > 1000) {
    pushInsight({
      id: "expense-timing-gap",
      severity: expenseGap > 0 ? "warn" : "info",
      score: Math.abs(expenseGap),
      title:
        expenseGap > 0
          ? "Cash expenses are above recognized expenses"
          : "Recognized expenses are above cash expenses",
      detail: `${periodLabel}: Actual expenses are ${formatCurrency(
        totalExpensesActual,
        currency,
      )} vs recognized ${formatCurrency(totalExpensesRecognized, currency)} (gap ${formatCurrency(
        expenseGap,
        currency,
      )}).`,
      recommendation:
        expenseGap > 0
          ? "Do not increase the expense budget yet. First separate timing-heavy payments (annual/quarterly) from recurring monthly spend, then reset the monthly budget based on recognized spend."
          : "Keep the expense budget anchored to recognized spend for this period, and use actual cash outflow separately for liquidity planning.",
    });
  }

  const topPlanVarianceExpenses = categoryTotalsRows
    .filter((r) => r.type === "EXPENSE")
    .map((r) => ({
      ...r,
      diffActual: r.actual - r.plan,
      diffRecognized: (r.recognized ?? r.actual) - r.plan,
    }))
    .filter((r) => Math.abs(r.diffRecognized) > 1000 || Math.abs(r.diffActual) > 1000)
    .sort((a, b) => Math.abs(b.diffRecognized) - Math.abs(a.diffRecognized))
    .slice(0, 2);

  topPlanVarianceExpenses.forEach((r, idx) => {
    const worseAgainstPlan = r.diffRecognized;
    pushInsight({
      id: `expense-plan-var-${r.categoryId}`,
      severity: worseAgainstPlan > 0 ? "warn" : "good",
      score: Math.abs(worseAgainstPlan) + (idx === 0 ? 10 : 0),
      title: `${r.categoryName} is ${
        worseAgainstPlan > 0 ? "above" : "below"
      } plan`,
      detail: `Recognized ${formatCurrency(
        r.recognized ?? r.actual,
        currency,
      )} vs budget ${formatCurrency(r.plan, currency)} (${formatCurrency(
        worseAgainstPlan,
        currency,
      )}). Actual is ${formatCurrency(r.actual, currency)}.`,
      recommendation:
        worseAgainstPlan > 0
          ? "Choose one: raise this category budget for future periods if this run-rate is expected, or set a hard cap for the next period and reduce discretionary spend in this category."
          : "If this under-spend is structural (not timing), reduce the forward budget and reallocate the surplus to categories that are consistently over plan.",
    });
  });

  const biggestTimingCategory = categoryTotalsRows
    .filter((r) => r.type === "EXPENSE")
    .sort(
      (a, b) =>
        Math.abs(b.recognizedDelta ?? 0) - Math.abs(a.recognizedDelta ?? 0),
    )[0];
  if (biggestTimingCategory && Math.abs(biggestTimingCategory.recognizedDelta ?? 0) > 1000) {
    pushInsight({
      id: `timing-shift-${biggestTimingCategory.categoryId}`,
      severity: "info",
      score: Math.abs(biggestTimingCategory.recognizedDelta ?? 0),
      title: `Largest timing shift is in ${biggestTimingCategory.categoryName}`,
      detail: `Recognized differs from actual by ${formatCurrency(
        biggestTimingCategory.recognizedDelta ?? 0,
        currency,
      )} for the selected period.`,
      recommendation:
        "Correct the allocation design for this category: confirm the amount being spread, the duration, and the start month so recognized expense reflects the intended period.",
    });
  }

  const annualBudgetRisk = annualBudgetRemainingRows
    .filter((r) => r.annualBudget > 0)
    .map((r) => ({
      ...r,
      pctUsedRecognized:
        r.annualBudget === 0
          ? 0
          : (r.spentRecognizedYtd / r.annualBudget) * 100,
    }))
    .sort((a, b) => b.pctUsedRecognized - a.pctUsedRecognized)[0];
  if (annualBudgetRisk && annualBudgetRisk.pctUsedRecognized >= 75) {
    pushInsight({
      id: `annual-budget-risk-${annualBudgetRisk.categoryId}`,
      severity: annualBudgetRisk.remainingRecognized < 0 ? "warn" : "info",
      score: annualBudgetRisk.pctUsedRecognized * 100,
      title: `${annualBudgetRisk.categoryName} annual budget is heavily used`,
      detail: `Recognized YTD spend is ${formatCurrency(
        annualBudgetRisk.spentRecognizedYtd,
        currency,
      )} of ${formatCurrency(annualBudgetRisk.annualBudget, currency)} (${annualBudgetRisk.pctUsedRecognized.toFixed(
        0,
      )}%).`,
      recommendation:
        annualBudgetRisk.remainingRecognized < 0
          ? "Decide now whether to formally raise the annual budget for this category or offset it by reducing other tracked annual-budget categories."
          : "Set a remaining-month spending cap for this category so the annual budget is not exhausted early.",
    });
  }

  const tierByKey = new Map(
    tierTotalsRecognized.map((t, i) => [
      t.key,
      { recognized: t.amount, actual: tierTotalsActual[i]?.amount ?? 0 },
    ]),
  );
  const nonEssentialRecognized =
    (tierByKey.get("NON_ESSENTIAL")?.recognized ?? 0) +
    (tierByKey.get("LUXURY")?.recognized ?? 0);
  if (totalExpensesRecognized > 0) {
    const discretionaryPct = (nonEssentialRecognized / totalExpensesRecognized) * 100;
    if (discretionaryPct >= 20) {
      pushInsight({
        id: "discretionary-mix",
        severity: discretionaryPct >= 30 ? "warn" : "info",
        score: discretionaryPct * 50,
        title: "Non-essential + luxury share is elevated",
        detail: `${discretionaryPct.toFixed(
          0,
        )}% of recognized expenses in ${periodLabel} are Non-essential or Luxury (${formatCurrency(
          nonEssentialRecognized,
          currency,
        )}).`,
        recommendation:
          "Set a target cap for Non-essential + Luxury as a share of recognized expenses, then reduce or defer the top discretionary categories this period.",
      });
    }
  }

  if (endInvestableBalanceForPeriod < 0) {
    pushInsight({
      id: "investable-negative",
      severity: "warn",
      score: Math.abs(endInvestableBalanceForPeriod) + 50000,
      title: "Investable balance goes negative in selected period",
      detail: `End investable balance is ${formatCurrency(
        endInvestableBalanceForPeriod,
        currency,
      )}. Excess investments are above available investable balance.`,
      recommendation:
        "Pick one source-of-funds decision: reduce above-plan investments, or explicitly increase Opening Investable Balance in Settings to reflect available capital.",
    });
  }

  if (totalNetActual < 0 || totalNetRecognized < 0) {
    pushInsight({
      id: "negative-net",
      severity: "warn",
      score: Math.max(Math.abs(totalNetActual), Math.abs(totalNetRecognized)),
      title: "Net cashflow is negative",
      detail: `Operational net (actual) is ${formatCurrency(
        totalNetActual,
        currency,
      )}; recognized net is ${formatCurrency(totalNetRecognized, currency)} for ${periodLabel}.`,
      recommendation:
        "Close the deficit with a plan: cut discretionary categories (Non-essential/Luxury/Travel), revise unrealistic budgets, or reduce within-plan investments for upcoming periods.",
    });
  }

  const sortedInsights = insights
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const topInsights = sortedInsights.slice(0, 3);
  const pulseExportData = {
    meta: {
      title: "Pulse Report",
      periodLabel,
      view,
      year,
      user: user.username,
      currency,
      monthsInScope: [...monthsInScope],
      generatedAt: new Date().toISOString(),
    },
    summary: {
      income: {
        plan: round2(totalBudgetIncome),
        actual: round2(totalIncome),
        ytdTotal: round2(ytdMonths.reduce((s, m) => s + m.income, 0)),
        averageMonthly: round2(ytdAvgIncome),
      },
      expenses: {
        plan: round2(totalBudgetExpenses),
        actual: round2(totalExpensesActual),
        recognized: round2(totalExpensesRecognized),
        ytdTotalActual: round2(ytdMonths.reduce((s, m) => s + m.expensesActual, 0)),
        ytdTotalRecognized: round2(
          ytdMonths.reduce((s, m) => s + m.expensesRecognized, 0),
        ),
        averageMonthlyActual: round2(ytdAvgExpensesActual),
        averageMonthlyRecognized: round2(ytdAvgExpensesRecognized),
      },
      investments: {
        plan: round2(totalBudgetInvestments),
        actual: round2(totalInvestments),
        ytdTotal: round2(ytdMonths.reduce((s, m) => s + m.investments, 0)),
        averageMonthly: round2(ytdAvgInvestments),
      },
      netCashflow: {
        plan: round2(totalBudgetNet),
        actual: round2(totalNetActual),
        recognized: round2(totalNetRecognized),
        ytdTotalActual: round2(ytdMonths.reduce((s, m) => s + m.netOperationalActual, 0)),
        ytdTotalRecognized: round2(
          ytdMonths.reduce((s, m) => s + m.netOperationalRecognized, 0),
        ),
        averageMonthlyActual: round2(ytdAvgNetActual),
        averageMonthlyRecognized: round2(ytdAvgNetRecognized),
      },
    },
    balances: {
      cash: {
        starting: round2(startingBalanceForPeriod),
        ending: round2(endBalance),
      },
      investable: {
        starting: round2(startingInvestableBalanceForPeriod),
        ending: round2(endInvestableBalanceForPeriod),
      },
    },
    needTierMix: tierTotalsActual.map((tier, idx) => ({
      tierKey: tier.key,
      tierLabel: tier.label,
      actual: round2(tier.amount),
      recognized: round2(tierTotalsRecognized[idx]?.amount ?? 0),
    })),
    monthlyBreakdown: periodMonths.map((m) => ({
      month: m.month,
      monthLabel: monthLabel(m.month),
      income: round2(m.income),
      expensesPlan: round2(m.budgetExpenses),
      expensesActual: round2(m.expensesActual),
      expensesRecognized: round2(m.expensesRecognized),
      investmentsPlan: round2(m.budgetInvestments),
      investmentsActual: round2(m.investments),
      netPlan: round2(m.budgetNet),
      netActual: round2(m.netOperationalActual),
      netRecognized: round2(m.netOperationalRecognized),
      balance: round2(m.balance),
    })),
    annualBudgetRemaining: annualBudgetRemainingRows.map((row) => ({
      categoryName: row.categoryName,
      annualBudget: round2(row.annualBudget),
      spentActualYtd: round2(row.spentActualYtd),
      spentRecognizedYtd: round2(row.spentRecognizedYtd),
      remainingActual: round2(row.remainingActual),
      remainingRecognized: round2(row.remainingRecognized),
    })),
    categoryTotals: categoryTotalsRows.map((row) => ({
      categoryName: row.categoryName,
      type: row.type,
      plan: round2(row.plan),
      actual: round2(row.actual),
      recognized: round2(row.recognized ?? row.actual),
      diffVsActual: round2(row.actual - row.plan),
      diffVsRecognized: row.type === "EXPENSE"
        ? round2((row.recognized ?? row.actual) - row.plan)
        : null,
      needTierFlags: row.needTierFlags ?? null,
    })),
    insights: sortedInsights.map((insight) => ({
      severity: insight.severity,
      title: insight.title,
      detail: insight.detail,
      recommendation: insight.recommendation ?? "",
    })),
  };

  if (isReportMode) {
    return (
      <PulseReportDocument
        data={pulseExportData}
        autoPrint={autoPrintReport}
      />
    );
  }

  return (
    <div id="pulse-report-root" className="pulse-export-root space-y-8">
      {/* Header + controls */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-800 dark:border-orange-700/60 dark:bg-orange-900/20 dark:text-orange-200">
            <SectionIcon name="pulse" className="h-3.5 w-3.5" />
            Pulse
          </div>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-orange-600 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-orange-300">
              <SectionIcon name="pulse" />
            </span>
            Family Financial Pulse
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {periodLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
              View: {view === "month" ? "Single month" : view === "ytd" ? "YTD" : view === "range" ? "Range" : "Full year"}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Months in scope: {monthsInScope.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
              User: {user.username}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 text-sm lg:items-end">
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Year
              </label>
              <YearSelector
                currentYear={year}
                minYear={minSelectableYear}
                maxYear={maxSelectableYear}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <DashboardPeriodSelector
                year={year}
                view={view}
                month={monthParam}
                monthFrom={monthFrom}
                monthTo={monthTo}
                minYear={minSelectableYear}
                minMonthForYear={minMonthForSelectedYear}
                maxYear={maxSelectableYear}
                maxMonthForYear={maxMonthForSelectedYear}
              />
            </div>
          </div>
          <div className="lg:max-w-full">
          <PulseExportActions
            title="Pulse report"
            filenameBase={exportFilenameBase}
            data={pulseExportData}
            pdfHref={pulsePdfHref}
          />
          </div>
        </div>
        </div>
      </div>
      {!allocationsAvailable && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          Allocation-based recognized metrics need a dev server restart to load the Prisma client.
        </p>
      )}

      {/* 2x2 grid: 4 KPI cards with progress bars */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-4">
          <DashboardProgressBar
            label="Income"
            plan={totalBudgetIncome}
            actual={totalIncome}
            type="income"
            currency={currency}
            subLabel={`YTD total: ${formatCurrency(ytdMonths.reduce((s, m) => s + m.income, 0), currency)} · Average Monthly: ${formatCurrency(ytdAvgIncome, currency)}`}
          />
          <DashboardProgressBar
            label="Investments"
            plan={totalBudgetInvestments}
            actual={totalInvestments}
            type="investment"
            currency={currency}
            subLabel={`YTD total: ${formatCurrency(ytdMonths.reduce((s, m) => s + m.investments, 0), currency)} · Average Monthly: ${formatCurrency(ytdAvgInvestments, currency)}`}
          />
        </div>
        <DashboardProgressBar
          label="Expenses"
          plan={totalBudgetExpenses}
          actual={totalExpensesActual}
          type="expense"
          currency={currency}
          subLabel={`YTD total: ${formatCurrency(ytdMonths.reduce((s, m) => s + m.expensesActual, 0), currency)} · Average Monthly: ${formatCurrency(ytdAvgExpensesActual, currency)}`}
          comparisonLabel="Recognized"
          comparisonValue={totalExpensesRecognized}
          comparisonSubLabel={`YTD total: ${formatCurrency(ytdMonths.reduce((s, m) => s + m.expensesRecognized, 0), currency)} · Average Monthly: ${formatCurrency(ytdAvgExpensesRecognized, currency)}`}
        />
        <DashboardProgressBar
          label="Net cashflow"
          plan={totalBudgetNet}
          actual={totalNetActual}
          type="net"
          currency={currency}
          subLabel={`YTD total: ${formatCurrency(ytdMonths.reduce((s, m) => s + m.netOperationalActual, 0), currency)} · Average Monthly: ${formatCurrency(ytdAvgNetActual, currency)}`}
          comparisonLabel="Recognized"
          comparisonValue={totalNetRecognized}
          comparisonSubLabel={`YTD total: ${formatCurrency(ytdMonths.reduce((s, m) => s + m.netOperationalRecognized, 0), currency)} · Average Monthly: ${formatCurrency(ytdAvgNetRecognized, currency)}`}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <SectionIcon name="insights" className="text-sky-600 dark:text-sky-300" />
              Insights & Recommendations
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
              Computed for the selected view and period: {periodLabel}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {sortedInsights.length} insight{sortedInsights.length === 1 ? "" : "s"}
          </span>
        </div>
        {sortedInsights.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
            No high-signal insights for this selection yet.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {topInsights.map((insight) => (
                <div
                  key={insight.id}
                  className={`rounded-xl border p-3 ${
                    insight.severity === "warn"
                      ? "border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/10"
                      : insight.severity === "good"
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-900/10"
                        : "border-sky-200 bg-sky-50 dark:border-sky-700/40 dark:bg-sky-900/10"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    {insight.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-700 dark:text-slate-300">
                    {insight.detail}
                  </p>
                  {insight.recommendation ? (
                    <p className="mt-2 text-[11px] font-medium text-slate-800 dark:text-slate-200">
                      Recommendation:{" "}
                      <span className="font-normal text-slate-700 dark:text-slate-300">
                        {insight.recommendation}
                      </span>
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            {sortedInsights.length > 3 ? (
              <PersistentDetails
                storageKey="dashboard-all-insights"
                defaultOpen={false}
                className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/40"
                summary={
                  <span className="cursor-pointer text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  Show all insights ({sortedInsights.length})
                  </span>
                }
              >
                <div className="mt-3 space-y-2">
                  {sortedInsights.map((insight, idx) => (
                    <div
                      key={`all-${insight.id}`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] dark:border-slate-600 dark:bg-slate-800"
                    >
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {idx + 1}. {insight.title}
                      </p>
                      <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                        {insight.detail}
                      </p>
                      {insight.recommendation ? (
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                          Recommendation: {insight.recommendation}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </PersistentDetails>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <SectionIcon name="mix" className="text-cyan-600 dark:text-cyan-300" />
              Expense Mix By Need Tier
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-700 dark:text-slate-300">
              Actual vs recognized mix using allocation-line tiers and category defaults.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
            Actual {formatCurrency(totalExpensesActual, currency)} · Recognized {formatCurrency(totalExpensesRecognized, currency)}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tierTotalsActual.map((tier, idx) => {
            const recognized = tierTotalsRecognized[idx]?.amount ?? 0;
            const pctActual = totalExpensesActual > 0 ? (tier.amount / totalExpensesActual) * 100 : 0;
            const pctRecognized =
              totalExpensesRecognized > 0 ? (recognized / totalExpensesRecognized) * 100 : 0;
            const tierTheme =
              tier.key === "ESSENTIAL"
                ? {
                    ring: "border-emerald-200 dark:border-emerald-700/40",
                    head: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200",
                    delta: "text-emerald-700 dark:text-emerald-300",
                  }
                : tier.key === "NON_ESSENTIAL"
                  ? {
                      ring: "border-sky-200 dark:border-sky-700/40",
                      head: "bg-sky-50 text-sky-800 dark:bg-sky-900/20 dark:text-sky-200",
                      delta: "text-sky-700 dark:text-sky-300",
                    }
                  : tier.key === "TRAVEL"
                    ? {
                        ring: "border-cyan-200 dark:border-cyan-700/40",
                        head: "bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200",
                        delta: "text-cyan-700 dark:text-cyan-300",
                      }
                    : {
                        ring: "border-rose-200 dark:border-rose-700/40",
                        head: "bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200",
                        delta: "text-rose-700 dark:text-rose-300",
                      };
            return (
              <div
                key={tier.key}
                className={`rounded-xl border bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm dark:from-slate-800 dark:to-slate-800/70 ${tierTheme.ring}`}
              >
                <p className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tierTheme.head}`}>
                  {tier.label}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-600 dark:bg-slate-900/40">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Actual
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(tier.amount, currency)}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      {pctActual.toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-600 dark:bg-slate-900/40">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Recognized
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(recognized, currency)}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      {pctRecognized.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <p className={`mt-2 text-[11px] font-medium ${tierTheme.delta}`}>
                  Delta {formatCurrency(recognized - tier.amount, currency)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Starting balance + end balance */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-800">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            <SectionIcon name="cash" className="text-emerald-600 dark:text-emerald-300" />
            Cash Balance
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                Starting
              </p>
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                {formatCurrency(startingBalanceForPeriod, currency)}
              </p>
              <p className="text-[11px] text-slate-800 dark:text-slate-300">
                {firstMonthInScope === 1
                  ? `Balance at start of ${year}`
                  : `End of ${monthLabel(firstMonthInScope - 1)}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                End
              </p>
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                {periodMonths.length
                  ? formatCurrency(
                      periodMonths[periodMonths.length - 1].balance,
                      currency,
                    )
                  : formatCurrency(Number(settings.initialBalance), currency)}
              </p>
              <p className="text-[11px] text-slate-800 dark:text-slate-300">
                Running balance at end of {periodLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-800">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            <SectionIcon name="investable" className="text-violet-600 dark:text-violet-300" />
            Investable Balance
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                Starting
              </p>
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                {formatCurrency(startingInvestableBalanceForPeriod, currency)}
              </p>
              <p className="text-[11px] text-slate-800 dark:text-slate-300">
                Balance at start of {periodLabel}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                End
              </p>
              <p
                className={`text-base font-medium ${
                  endInvestableBalanceForPeriod < 0
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {formatCurrency(endInvestableBalanceForPeriod, currency)}
              </p>
              <p className="text-[11px] text-slate-800 dark:text-slate-300">
                After excess investments in {periodLabel}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Progress vs target bar chart + Waterfall (hidden on single-month view) */}
      {showMultiMonthCharts && (
        <section className="grid gap-4 lg:grid-cols-2">
          <DashboardProgressCharts
            totalIncome={totalIncome}
            totalExpenses={totalExpensesActual}
            totalInvestments={totalInvestments}
            totalNet={totalNetActual}
            budgetIncome={totalBudgetIncome}
            budgetExpenses={totalBudgetExpenses}
            budgetInvestments={totalBudgetInvestments}
            budgetNet={totalBudgetNet}
            currency={currency}
          />
          <DashboardWaterfallChart
            initialBalance={startingBalanceForPeriod}
            totalIncome={totalIncome}
            totalExpenses={totalExpensesActual}
            totalInvestments={totalInvestmentsFundedFromCashflow}
            endBalance={endBalance}
            currency={currency}
          />
        </section>
      )}

      {/* Trend line chart: actual values with previous period comparison (hidden for single month) */}
      {showTrendChart && trendLineData.length > 0 && (
        <DashboardTrendLineChart data={trendLineData} currency={currency} />
      )}

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div
            className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 dark:border-slate-600 dark:from-slate-700 dark:to-slate-800"
            style={{ borderLeft: "4px solid #ff8000" }}
          >
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <SectionIcon name="table" className="text-orange-600 dark:text-orange-300" />
              Monthly breakdown (Cash actual + recognized)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur dark:bg-slate-700/95">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                  <th className="px-4 py-2">Month</th>
                  <th className="px-4 py-2">Income (P|A)</th>
                  <th className="px-4 py-2">Expenses (P|A|R)</th>
                  <th className="px-4 py-2">Investments (P|A)</th>
                  <th className="px-4 py-2">Net (P|A|R)</th>
                  <th className="px-4 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {periodMonths.map((m) => (
                  <tr
                    key={m.month}
                    className="border-t border-slate-100 text-slate-700 odd:bg-white even:bg-slate-50/50 dark:border-slate-600 dark:text-slate-300 dark:odd:bg-slate-800 dark:even:bg-slate-800/60"
                  >
                    <td className="px-4 py-2 text-slate-800 dark:text-slate-300">
                      {monthLabel(m.month)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-slate-700 dark:text-slate-300">
                        {m.budgetIncome
                          ? formatCurrency(m.budgetIncome, currency)
                          : "\u2013"}
                      </span>
                      {" | "}
                      <span className="dark:text-slate-200">
                        {m.income
                          ? formatCurrency(m.income, currency)
                          : "\u2013"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-red-700 dark:text-red-400">
                      <span className="text-slate-700 dark:text-slate-300">
                        {m.budgetExpenses
                          ? formatCurrency(m.budgetExpenses, currency)
                          : "\u2013"}
                      </span>
                      {" | "}
                      {m.expensesActual
                        ? formatCurrency(m.expensesActual, currency)
                        : "\u2013"}
                      {" | "}
                      <span className="font-medium text-amber-800 dark:text-amber-200">
                        {m.expensesRecognized
                          ? formatCurrency(m.expensesRecognized, currency)
                        : "\u2013"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sky-700 dark:text-sky-400">
                      <span className="text-slate-700 dark:text-slate-300">
                        {m.budgetInvestments
                          ? formatCurrency(m.budgetInvestments, currency)
                          : "\u2013"}
                      </span>
                      {" | "}
                      {m.investments
                        ? formatCurrency(m.investments, currency)
                        : "\u2013"}
                    </td>
                    <td
                      className={`px-4 py-2 ${
                        m.netOperationalActual >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      <span className="text-slate-700 dark:text-slate-300">
                        {m.budgetNet
                          ? formatCurrency(m.budgetNet, currency)
                          : "\u2013"}
                      </span>
                      {" | "}
                      {m.netOperationalActual ? formatCurrency(m.netOperationalActual, currency) : "\u2013"}
                      {" | "}
                      <span className="font-medium text-amber-800 dark:text-amber-200">
                        {m.netOperationalRecognized ? formatCurrency(m.netOperationalRecognized, currency) : "\u2013"}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                      {formatCurrency(m.balance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div
              className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 dark:border-slate-600 dark:from-emerald-900/10 dark:to-slate-800"
              style={{ borderLeft: "4px solid #22c55e" }}
            >
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <SectionIcon name="annualBudget" className="text-emerald-600 dark:text-emerald-300" />
                Annual Budget Remaining (Selected Categories)
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                Calendar year {year}, remaining after Jan-{monthLabel(periodEndMonth)}.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-right">Annual budget</th>
                    <th className="px-3 py-2 text-right">Spent YTD (Actual)</th>
                    <th className="px-3 py-2 text-right">Remaining (Actual)</th>
                  </tr>
                </thead>
                <tbody>
                  {annualBudgetRemainingRows.length === 0 ? (
                    <tr className="border-t border-slate-100 dark:border-slate-600">
                      <td
                        colSpan={4}
                        className="px-3 py-3 text-slate-700 dark:text-slate-300"
                      >
                        No categories selected yet. Go to Settings and choose expense categories for annual budget remaining.
                      </td>
                    </tr>
                  ) : (
                    annualBudgetRemainingRows.map((row) => {
                      const actualOver = row.remainingActual < 0;
                      return (
                        <tr
                          key={`annual-rem-${row.categoryId}`}
                          className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                        >
                          <td className="px-3 py-2">{row.categoryName}</td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(row.annualBudget, currency)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(row.spentActualYtd, currency)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${
                              actualOver ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {formatCurrency(row.remainingActual, currency)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <CollapsibleSection title="Category totals (period)" defaultOpen={false}>
            <DashboardCategoryTotalsTable
              rows={categoryTotalsRows}
              currency={currency}
            />
          </CollapsibleSection>
        </div>
      </section>
    </div>
  );
}
