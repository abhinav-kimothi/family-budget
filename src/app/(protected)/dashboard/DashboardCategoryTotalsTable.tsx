"use client";

import { useMemo, useState } from "react";

export type CategoryTotalRow = {
  categoryId: number;
  categoryName: string;
  type: "INCOME" | "EXPENSE" | "INVESTMENT";
  plan: number;
  actual: number;
  recognized?: number;
  prevActual: number;
  cashActual?: number;
  recognizedDelta?: number;
  needTierFlags?: {
    nonEssential?: "partial" | "full";
    travel?: "partial" | "full";
    luxury?: "partial" | "full";
  };
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

type SortKey = "plan" | "actual" | "diff";

function SortHeader({
  label,
  keyName,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  keyName: SortKey;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className="px-3 py-2 text-right">
      <button
        type="button"
        onClick={() => onSort(keyName)}
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-slate-800 transition hover:text-slate-600 dark:text-slate-300 dark:hover:text-slate-100"
      >
        {label}
        {sortBy === keyName ? (
          <span className="text-[10px]" aria-hidden>
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        ) : null}
      </button>
    </th>
  );
}

export function DashboardCategoryTotalsTable({
  rows,
  currency,
}: {
  rows: CategoryTotalRow[];
  currency: string;
}) {
  const [sortBy, setSortBy] = useState<SortKey>("actual");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const groups = useMemo(() => {
    const byType = {
      INCOME: [] as CategoryTotalRow[],
      EXPENSE: [] as CategoryTotalRow[],
      INVESTMENT: [] as CategoryTotalRow[],
    };
    for (const r of rows) {
      byType[r.type].push(r);
    }
    const order: ("INCOME" | "EXPENSE" | "INVESTMENT")[] = ["INCOME", "EXPENSE", "INVESTMENT"];
    return order.map((type) => ({
      type,
      label: type === "INCOME" ? "Income" : type === "INVESTMENT" ? "Investments" : "Expenses",
      rows: byType[type],
    }));
  }, [rows]);

  const sortedGroups = useMemo(() => {
    return groups.map((g) => {
      const withMeta = g.rows.map((r) => {
        const diff = r.actual - r.plan;
        return { ...r, diff };
      });
      const sorted = [...withMeta].sort((a, b) => {
        let aVal: number, bVal: number;
        switch (sortBy) {
          case "plan":
            aVal = a.plan;
            bVal = b.plan;
            break;
          case "actual":
            aVal = a.actual;
            bVal = b.actual;
            break;
          case "diff":
            aVal = a.diff;
            bVal = b.diff;
            break;
          default:
            return 0;
        }
        if (aVal !== bVal) return sortDir === "asc" ? (aVal < bVal ? -1 : 1) : aVal > bVal ? -1 : 1;
        return a.categoryName.localeCompare(b.categoryName);
      });
      return { ...g, rows: sorted };
    });
  }, [groups, sortBy, sortDir]);

  const cycleSort = (key: SortKey) => {
    if (sortBy !== key) {
      setSortBy(key);
      setSortDir(key === "actual" || key === "plan" || key === "diff" ? "desc" : "asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const expenseRows = useMemo(
    () => rows.filter((r) => r.type === "EXPENSE"),
    [rows],
  );

  const topOverBudget = useMemo(() => {
    return expenseRows
      .map((r) => {
        const recognized = r.recognized ?? r.actual;
        const over = recognized - r.plan;
        const utilizationPct =
          r.plan > 0 ? (recognized / r.plan) * 100 : recognized > 0 ? 100 : 0;
        return { ...r, recognized, over, utilizationPct };
      })
      .filter((r) => r.plan > 0 && r.over > 0.0001)
      .sort((a, b) => b.over - a.over)
      .slice(0, 2);
  }, [expenseRows]);

  const leastUtilized = useMemo(() => {
    return expenseRows
      .map((r) => {
        const recognized = r.recognized ?? r.actual;
        const utilizationPct = r.plan > 0 ? (recognized / r.plan) * 100 : Infinity;
        const remaining = r.plan - recognized;
        return { ...r, recognized, utilizationPct, remaining };
      })
      .filter((r) => r.plan > 0 && r.recognized <= r.plan + 0.0001)
      .sort((a, b) => {
        if (a.utilizationPct !== b.utilizationPct) return a.utilizationPct - b.utilizationPct;
        return b.remaining - a.remaining;
      })
      .slice(0, 2);
  }, [expenseRows]);

  const utilizationText = (recognized: number, plan: number) => {
    if (plan <= 0) return "No plan";
    return `${((recognized / plan) * 100).toFixed(0)}% used`;
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3 dark:border-rose-700/40 dark:from-rose-900/10 dark:to-slate-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-200">
              Top Over Budget (Expenses)
            </p>
            <span className="text-[10px] text-rose-700 dark:text-rose-300">
              Ranked by recognized overrun
            </span>
          </div>
          <div className="space-y-2">
            {topOverBudget.length === 0 ? (
              <div className="rounded-lg border border-rose-200/70 bg-white/80 px-3 py-2 text-[11px] text-slate-700 dark:border-rose-700/30 dark:bg-slate-800/70 dark:text-slate-300">
                No expense categories are above budget for this selection.
              </div>
            ) : (
              topOverBudget.map((row, idx) => (
                <div
                  key={`over-${row.categoryId}`}
                  className="rounded-lg border border-rose-200/70 bg-white/90 px-3 py-2 dark:border-rose-700/30 dark:bg-slate-800/80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                      {idx + 1}. {row.categoryName}
                    </p>
                    <span className="rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                      +{formatCurrency(row.over, currency)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                    Budget {formatCurrency(row.plan, currency)} · Recognized {formatCurrency(row.recognized, currency)} · Actual {formatCurrency(row.actual, currency)}
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">
                    {utilizationText(row.recognized, row.plan)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 dark:border-emerald-700/40 dark:from-emerald-900/10 dark:to-slate-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
              Least Utilized Budget (Expenses)
            </p>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
              Lowest recognized utilization
            </span>
          </div>
          <div className="space-y-2">
            {leastUtilized.length === 0 ? (
              <div className="rounded-lg border border-emerald-200/70 bg-white/80 px-3 py-2 text-[11px] text-slate-700 dark:border-emerald-700/30 dark:bg-slate-800/70 dark:text-slate-300">
                No planned expense categories available for utilization ranking.
              </div>
            ) : (
              leastUtilized.map((row, idx) => (
                <div
                  key={`under-${row.categoryId}`}
                  className="rounded-lg border border-emerald-200/70 bg-white/90 px-3 py-2 dark:border-emerald-700/30 dark:bg-slate-800/80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                      {idx + 1}. {row.categoryName}
                    </p>
                    <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                      {row.plan > 0 ? `${row.utilizationPct.toFixed(0)}%` : "No plan"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                    Budget {formatCurrency(row.plan, currency)} · Recognized {formatCurrency(row.recognized, currency)} · Remaining {formatCurrency(row.remaining, currency)}
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">
                    Actual {formatCurrency(row.actual, currency)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-medium text-slate-600 dark:text-slate-300">Sort by:</span>
          {(["plan", "actual", "diff"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => cycleSort(key)}
              className={`rounded-full border px-2.5 py-1 capitalize transition ${
                sortBy === key
                  ? "border-sky-300 bg-sky-50 text-sky-800 shadow-sm dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              }`}
            >
              {key}
              {sortBy === key && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
          ))}
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
          Recognized-aware expense ranking
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-2 dark:border-slate-600 dark:from-slate-700 dark:to-slate-800">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">
            Category Performance Matrix
          </p>
        </div>
      <div className="overflow-x-auto">
      <table className="min-w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wider text-slate-800 backdrop-blur dark:bg-slate-700/95 dark:text-slate-300">
          <tr>
            <th className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50/95 px-3 py-2 text-left dark:border-slate-600 dark:bg-slate-700/95">
              Category
            </th>
            <th className="px-3 py-2 text-left">Type</th>
            <SortHeader
              label="Plan"
              keyName="plan"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={cycleSort}
            />
            <SortHeader
              label="Actual"
              keyName="actual"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={cycleSort}
            />
            <th className="px-3 py-2 text-right">Recognized</th>
            <th className="px-3 py-2 text-right">Diff (vs Actual)</th>
            <th className="px-3 py-2 text-right">Diff (vs Recognized)</th>
          </tr>
        </thead>
        <tbody>
          {sortedGroups.flatMap((g) => {
            if (!g.rows.length) return [];
            const headerRow = (
              <tr
                key={`${g.type}-header`}
                className="border-t border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                <td className="px-3 py-2" colSpan={8}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        g.type === "INCOME"
                          ? "bg-emerald-500"
                          : g.type === "INVESTMENT"
                            ? "bg-sky-500"
                            : "bg-amber-500"
                      }`}
                    />
                    {g.label}
                  </span>
                </td>
              </tr>
            );
            const categoryRows = g.rows.map((row) => {
              const diff = row.actual - row.plan;
              const recognizedValue =
                row.type === "EXPENSE" ? (row.recognized ?? row.actual) : row.actual;
              const diffRecognized = recognizedValue - row.plan;
              const typeLabel =
                row.type === "INCOME" ? "Income" : row.type === "INVESTMENT" ? "Investment" : "Expense";
              const diffClass =
                diff === 0
                  ? "text-slate-700"
                  : diff > 0
                    ? row.type === "INCOME" || row.type === "INVESTMENT"
                      ? "text-emerald-700"
                      : "text-rose-700"
                    : row.type === "EXPENSE"
                      ? "text-emerald-700"
                      : "text-rose-700";
              const diffRecognizedClass =
                diffRecognized === 0
                  ? "text-slate-700"
                  : diffRecognized > 0
                    ? row.type === "INCOME" || row.type === "INVESTMENT"
                      ? "text-emerald-700"
                      : "text-rose-700"
                    : row.type === "EXPENSE"
                      ? "text-emerald-700"
                      : "text-rose-700";
              const pctText = (value: number, plan: number) => {
                if (plan === 0) return value === 0 ? "0%" : "new";
                const pct = ((value - plan) / Math.abs(plan)) * 100;
                if (pct === 0) return "0%";
                return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
              };
              return (
                <tr
                  key={row.categoryId}
                  className={`border-t border-slate-100 text-slate-700 odd:bg-white even:bg-slate-50/40 dark:border-slate-600 dark:text-slate-300 dark:odd:bg-slate-800 dark:even:bg-slate-800/60 ${
                    row.type === "EXPENSE" &&
                    (Math.abs(row.recognizedDelta ?? 0) > 0.0001 ||
                      row.needTierFlags?.nonEssential ||
                      row.needTierFlags?.travel ||
                      row.needTierFlags?.luxury)
                      ? "bg-amber-50/50 dark:bg-amber-900/10"
                      : ""
                  }`}
                >
                    <td className="sticky left-0 z-[1] border-r border-slate-100 px-3 py-2 text-[11px] bg-inherit dark:border-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.categoryName}</span>
                      {row.type === "EXPENSE" &&
                        Math.abs(row.recognizedDelta ?? 0) > 0.0001 && (
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                            {row.recognizedDelta! > 0 ? "+" : ""}
                            {formatCurrency(row.recognizedDelta!, currency)}
                          </span>
                        )}
                      {row.needTierFlags?.nonEssential && (
                        <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[9px] font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                          NE {row.needTierFlags.nonEssential === "partial" ? "(part)" : "(full)"}
                        </span>
                      )}
                      {row.needTierFlags?.travel && (
                        <span className="rounded-full border border-teal-300 bg-teal-100 px-2 py-0.5 text-[9px] font-medium text-teal-800 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-200">
                          Travel {row.needTierFlags.travel === "partial" ? "(part)" : "(full)"}
                        </span>
                      )}
                      {row.needTierFlags?.luxury && (
                        <span className="rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[9px] font-medium text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                          Luxury {row.needTierFlags.luxury === "partial" ? "(part)" : "(full)"}
                        </span>
                      )}
                    </div>
                  </td>
                    <td className="px-3 py-2 text-[10px] text-slate-700 dark:text-slate-300">
                      <span
                        className={`rounded-full border px-2 py-0.5 ${
                          row.type === "INCOME"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200"
                            : row.type === "INVESTMENT"
                              ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200"
                              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
                        }`}
                      >
                        {typeLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.plan ? formatCurrency(row.plan, currency) : "–"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.actual ? formatCurrency(row.actual, currency) : "–"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                      row.type === "EXPENSE" &&
                      Math.abs((row.recognized ?? row.actual) - row.actual) > 0.0001
                        ? "font-medium text-amber-900 dark:text-amber-200"
                        : ""
                    }`}
                  >
                    {row.type === "EXPENSE"
                      ? row.recognized
                        ? formatCurrency(row.recognized, currency)
                        : "–"
                      : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${diffClass}`}>
                    {diff
                      ? (
                        <div className="inline-flex flex-col items-end leading-tight">
                          <span className="font-medium">{formatCurrency(diff, currency)}</span>
                          <span className="text-[10px] opacity-80">{pctText(row.actual, row.plan)}</span>
                        </div>
                      )
                      : row.plan || row.actual
                        ? <span className="text-[10px]">– ({pctText(row.actual, row.plan)})</span>
                        : "–"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${diffRecognizedClass}`}>
                    {row.type !== "EXPENSE"
                      ? "—"
                      : diffRecognized
                        ? (
                          <div className="inline-flex flex-col items-end leading-tight">
                            <span className="font-medium">{formatCurrency(diffRecognized, currency)}</span>
                            <span className="text-[10px] opacity-80">{pctText(recognizedValue, row.plan)}</span>
                          </div>
                        )
                        : row.plan || recognizedValue
                          ? <span className="text-[10px]">– ({pctText(recognizedValue, row.plan)})</span>
                          : "–"}
                  </td>
                </tr>
              );
            });
            return [headerRow, ...categoryRows];
          })}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}
