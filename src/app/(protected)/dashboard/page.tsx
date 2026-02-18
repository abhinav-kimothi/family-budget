import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { YearSelector } from "./YearSelector";
import { DashboardPeriodSelector } from "./DashboardPeriodSelector";
import { DashboardProgressBar } from "./DashboardProgressBar";
import { DashboardProgressCharts } from "./DashboardProgressCharts";
import { DashboardWaterfallChart } from "./DashboardWaterfallChart";
import { DashboardTrendLineChart } from "./DashboardTrendLineChart";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import {
  DashboardCategoryTotalsTable,
  type CategoryTotalRow,
} from "./DashboardCategoryTotalsTable";

type SummaryMonth = {
  month: number;
  income: number;
  expenses: number;
  investments: number;
  net: number;
  balance: number;
  budgetIncome: number;
  budgetExpenses: number;
  budgetInvestments: number;
  budgetNet: number;
};

function monthLabel(m: number) {
  return new Date(2000, m - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
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
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const now = new Date();
  const year = params?.year ? Number(params.year) : now.getFullYear();
  const view = (params?.view as "full" | "month" | "ytd" | "range") || "month";
  const monthParam = params?.month ? Number(params.month) : now.getMonth() + 1;
  const monthFrom = params?.monthFrom ? Number(params.monthFrom) : 1;
  const monthTo = params?.monthTo ? Number(params.monthTo) : 12;
  const hideEmpty = params?.hideEmpty === "1";

  // Months in scope for the selected period
  const from = view === "range" ? Math.min(monthFrom, monthTo) : 1;
  const to =
    view === "range"
      ? Math.max(monthFrom, monthTo)
      : view === "ytd"
        ? monthParam
        : view === "month"
          ? monthParam
          : 12;
  const monthsInScope: number[] =
    view === "full"
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
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
      currency: "USD",
    },
  });

  const [entries, entriesPrevYear, budgets] = await Promise.all([
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
  ]);

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const months: SummaryMonth[] = [];
  let runningBalance = Number(settings.initialBalance);

  for (let m = 1; m <= 12; m += 1) {
    const monthEntries = entries.filter((e) => e.month === m);
    const monthBudgets = budgets.filter((b) => b.month === m);

    const income = monthEntries
      .filter((e) => e.category.type === "INCOME")
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const expenses = monthEntries
      .filter((e) => e.category.type === "EXPENSE")
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const investments = monthEntries
      .filter((e) => e.category.type === "INVESTMENT")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const budgetIncome = monthBudgets
      .filter((b) => b.category.type === "INCOME")
      .reduce((sum, b) => sum + Number(b.amount), 0);
    const budgetExpenses = monthBudgets
      .filter((b) => b.category.type === "EXPENSE")
      .reduce((sum, b) => sum + Number(b.amount), 0);
    const budgetInvestments = monthBudgets
      .filter((b) => b.category.type === "INVESTMENT")
      .reduce((sum, b) => sum + Number(b.amount), 0);

    const net = income - expenses - investments;
    const budgetNet = budgetIncome - budgetExpenses - budgetInvestments;
    runningBalance += net;

    months.push({
      month: m,
      income,
      expenses,
      investments,
      net,
      balance: runningBalance,
      budgetIncome,
      budgetExpenses,
      budgetInvestments,
      budgetNet,
    });
  }

  // Period-scoped months and totals
  const periodMonths = months.filter((m) => monthsInScope.includes(m.month));
  const totalIncome = periodMonths.reduce((sum, m) => sum + m.income, 0);
  const totalExpenses = periodMonths.reduce((sum, m) => sum + m.expenses, 0);
  const totalInvestments = periodMonths.reduce(
    (sum, m) => sum + m.investments,
    0,
  );
  const totalNet = periodMonths.reduce((sum, m) => sum + m.net, 0);
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
  const totalBudgetNet =
    totalBudgetIncome - totalBudgetExpenses - totalBudgetInvestments;

  const currency = settings.currency || "USD";

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
  const prevYearDecemberTotals = {
    income: prevYearDecEntries
      .filter((e) => e.category.type === "INCOME")
      .reduce((s, e) => s + Number(e.amount), 0),
    expenses: prevYearDecEntries
      .filter((e) => e.category.type === "EXPENSE")
      .reduce((s, e) => s + Number(e.amount), 0),
    investments: prevYearDecEntries
      .filter((e) => e.category.type === "INVESTMENT")
      .reduce((s, e) => s + Number(e.amount), 0),
  };
  prevYearDecemberTotals.net =
    prevYearDecemberTotals.income -
    prevYearDecemberTotals.expenses -
    prevYearDecemberTotals.investments;

  // Trend chart: current month values + previous calendar month (for tooltip and % change)
  const showTrendChart = view !== "month" && periodMonths.length > 1;
  const trendLineData = showTrendChart
    ? periodMonths.map((m) => {
        const prev =
          m.month === 1
            ? prevYearDecemberTotals
            : months.find((mo) => mo.month === m.month - 1);
        return {
          month: monthLabel(m.month),
          income: m.income,
          expenses: m.expenses,
          investments: m.investments,
          net: m.net,
          prevIncome: prev?.income ?? null,
          prevExpenses: prev?.expenses ?? null,
          prevInvestments: prev?.investments ?? null,
          prevNet: prev?.net ?? null,
        };
      })
    : [];

  // Category-level totals for the period only (for category table and hideEmpty)
  const actualTotalsByCategory = new Map<number, number>();
  const budgetTotalsByCategory = new Map<number, number>();
  for (const entry of entries) {
    if (!monthsInScope.includes(entry.month)) continue;
    const prev = actualTotalsByCategory.get(entry.categoryId) ?? 0;
    actualTotalsByCategory.set(
      entry.categoryId,
      prev + Number(entry.amount),
    );
  }
  for (const b of budgets) {
    if (!monthsInScope.includes(b.month)) continue;
    const prev = budgetTotalsByCategory.get(b.categoryId) ?? 0;
    budgetTotalsByCategory.set(b.categoryId, prev + Number(b.amount));
  }

  const categoriesForDisplay = hideEmpty
    ? categories.filter((c) => (actualTotalsByCategory.get(c.id) ?? 0) > 0)
    : categories;

  const categoryTotalsRows: CategoryTotalRow[] = categoriesForDisplay.map(
    (c) => ({
      categoryId: c.id,
      categoryName: c.name,
      type: c.type,
      plan: budgetTotalsByCategory.get(c.id) ?? 0,
      actual: actualTotalsByCategory.get(c.id) ?? 0,
      prevActual: prevActualByCategory.get(c.id) ?? 0,
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

  return (
    <div className="space-y-8">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">
            Cashflow
          </h1>
          <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-300">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
              Year
            </label>
            <YearSelector currentYear={year} />
          </div>
          <DashboardPeriodSelector
            year={year}
            view={view}
            month={monthParam}
            monthFrom={monthFrom}
            monthTo={monthTo}
            hideEmpty={hideEmpty}
          />
        </div>
      </div>

      {/* 2x2 grid: 4 KPI cards with progress bars */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardProgressBar
          label="Income"
          plan={totalBudgetIncome}
          actual={totalIncome}
          type="income"
          currency={currency}
        />
        <DashboardProgressBar
          label="Expenses"
          plan={totalBudgetExpenses}
          actual={totalExpenses}
          type="expense"
          currency={currency}
        />
        <DashboardProgressBar
          label="Investments"
          plan={totalBudgetInvestments}
          actual={totalInvestments}
          type="investment"
          currency={currency}
        />
        <DashboardProgressBar
          label="Net cashflow"
          plan={totalBudgetNet}
          actual={totalNet}
          type="net"
          currency={currency}
        />
      </section>

      {/* Starting balance + end balance */}
      <section className="flex flex-wrap gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
            Starting cash balance
          </p>
          <p className="text-base font-medium text-slate-900 dark:text-slate-100">
            {formatCurrency(startingBalanceForPeriod, currency)}
          </p>
          <p className="text-[11px] text-slate-800 dark:text-slate-300">
            {firstMonthInScope === 1
              ? `Balance at start of ${year} (included in running balance below)`
              : `Ending balance of ${monthLabel(firstMonthInScope - 1)} (previous month)`}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
            End balance (after period)
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
      </section>

      {/* Progress vs target bar chart + Waterfall */}
      <section className="grid gap-4 lg:grid-cols-2">
        <DashboardProgressCharts
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          totalInvestments={totalInvestments}
          totalNet={totalNet}
          budgetIncome={totalBudgetIncome}
          budgetExpenses={totalBudgetExpenses}
          budgetInvestments={totalBudgetInvestments}
          budgetNet={totalBudgetNet}
          currency={currency}
        />
        <DashboardWaterfallChart
          initialBalance={startingBalanceForPeriod}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          totalInvestments={totalInvestments}
          endBalance={endBalance}
          currency={currency}
        />
      </section>

      {/* Trend line chart: actual values with previous period comparison (hidden for single month) */}
      {showTrendChart && trendLineData.length > 0 && (
        <DashboardTrendLineChart data={trendLineData} currency={currency} />
      )}

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          <div
            className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-700"
            style={{ borderLeft: "4px solid #ff8000" }}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Monthly breakdown (Plan | Actual)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                  <th className="px-4 py-2">Month</th>
                  <th className="px-4 py-2">Income (P|A)</th>
                  <th className="px-4 py-2">Expenses (P|A)</th>
                  <th className="px-4 py-2">Investments (P|A)</th>
                  <th className="px-4 py-2">Net (P|A)</th>
                  <th className="px-4 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {periodMonths.map((m) => (
                  <tr
                    key={m.month}
                    className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
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
                      {m.expenses
                        ? formatCurrency(m.expenses, currency)
                        : "\u2013"}
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
                        m.net >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      <span className="text-slate-700 dark:text-slate-300">
                        {m.budgetNet
                          ? formatCurrency(m.budgetNet, currency)
                          : "\u2013"}
                      </span>
                      {" | "}
                      {m.net ? formatCurrency(m.net, currency) : "\u2013"}
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

        <CollapsibleSection title="Category totals (period)" defaultOpen={false}>
            <DashboardCategoryTotalsTable
              rows={categoryTotalsRows}
              currency={currency}
            />
          </CollapsibleSection>
      </section>
    </div>
  );
}

