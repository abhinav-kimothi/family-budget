"use client";

import { useMemo, useState } from "react";

export type CategoryTotalRow = {
  categoryId: number;
  categoryName: string;
  type: "INCOME" | "EXPENSE" | "INVESTMENT";
  plan: number;
  actual: number;
  prevActual: number;
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function trendPct(current: number, previous: number): { str: string | null; num: number } {
  if (previous === 0) return { str: current === 0 ? null : "new", num: current === 0 ? 0 : 100 };
  const num = ((current - previous) / Math.abs(previous)) * 100;
  if (num === 0) return { str: "0%", num: 0 };
  return { str: `${num >= 0 ? "+" : ""}${num.toFixed(0)}%`, num };
}

type SortKey = "plan" | "actual" | "diff" | "trend";

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
        const trend = trendPct(r.actual, r.prevActual);
        return { ...r, diff, trendStr: trend.str, trendNum: trend.num };
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
          case "trend":
            aVal = a.trendNum;
            bVal = b.trendNum;
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
      setSortDir(key === "actual" || key === "plan" || key === "diff" || key === "trend" ? "desc" : "asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-medium text-slate-700 dark:text-slate-300">Sort by:</span>
        {(["plan", "actual", "diff", "trend"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => cycleSort(key)}
            className={`rounded border px-2 py-1 capitalize transition ${
              sortBy === key
                ? "border-[#47c7fc] bg-[#47c7fc]/10 text-[#0369a1] dark:border-[#47c7fc] dark:bg-[#47c7fc]/20 dark:text-[#67e8f9]"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            }`}
          >
            {key}
            {sortBy === key && (sortDir === "asc" ? " ↑" : " ↓")}
          </button>
        ))}
      </div>
      <table className="min-w-full text-[11px]">
        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
          <tr>
            <th className="px-3 py-2 text-left">Category</th>
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
            <SortHeader
              label="Diff"
              keyName="diff"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={cycleSort}
            />
            <SortHeader
              label="Trend"
              keyName="trend"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={cycleSort}
            />
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
                <td className="px-3 py-2" colSpan={6}>
                  {g.label}
                </td>
              </tr>
            );
            const categoryRows = g.rows.map((row) => {
              const diff = row.actual - row.plan;
              const trend = trendPct(row.actual, row.prevActual);
              const typeLabel =
                row.type === "INCOME" ? "Income" : row.type === "INVESTMENT" ? "Investment" : "Expense";
              const diffClass =
                diff === 0
                  ? "text-slate-700"
                  : diff > 0
                    ? row.type === "INCOME"
                      ? "text-emerald-700"
                      : "text-rose-700"
                    : "text-amber-800";
              const trendClass =
                trend.str === null
                  ? "text-slate-700"
                  : trend.str === "new"
                    ? "text-sky-700"
                    : (trend.str.startsWith("+") && (row.type === "INCOME" || row.type === "INVESTMENT")) ||
                        (trend.str.startsWith("-") && row.type === "EXPENSE")
                      ? "text-emerald-700"
                      : "text-rose-700";
              return (
                <tr
                  key={row.categoryId}
                  className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                >
                  <td className="px-3 py-1.5 text-[11px] dark:text-slate-300">{row.categoryName}</td>
                  <td className="px-3 py-1.5 text-[10px] text-slate-700 dark:text-slate-300">{typeLabel}</td>
                  <td className="px-3 py-1.5 text-right">
                    {row.plan ? formatCurrency(row.plan, currency) : "–"}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {row.actual ? formatCurrency(row.actual, currency) : "–"}
                  </td>
                  <td className={`px-3 py-1.5 text-right ${diffClass}`}>
                    {diff ? formatCurrency(diff, currency) : "–"}
                  </td>
                  <td className={`px-3 py-1.5 text-right text-[10px] ${trendClass}`}>
                    {trend.str ?? "–"}
                  </td>
                </tr>
              );
            });
            return [headerRow, ...categoryRows];
          })}
        </tbody>
      </table>
    </div>
  );
}
