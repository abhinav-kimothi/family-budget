"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { useChartColors } from "@/hooks/useChartColors";

function formatCur(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Waterfall: Excel-style stacked bar.
 * - First series (base): invisible or background color. Value = 0 for Start/End, or cumulative before this column. So the visible bar starts at y = base.
 * - Second series (value): the visible segment. Start/End = full bar from 0; others = delta (income up, expenses/inv down).
 * So: Start = base 0, value s. Income = base s, value income. End = base 0, value end.
 */
export function DashboardWaterfallChart({
  initialBalance,
  totalIncome,
  totalExpenses,
  totalInvestments,
  endBalance,
  currency,
}: {
  initialBalance: number;
  totalIncome: number;
  totalExpenses: number;
  totalInvestments: number;
  endBalance: number;
  currency: string;
}) {
  const colors = useChartColors();
  const s = initialBalance;
  const afterIncome = s + totalIncome;
  const afterExpenses = afterIncome - totalExpenses;

  const data = [
    { name: "Start", base: 0, value: s, fill: colors.start },
    { name: "Income", base: s, value: totalIncome, fill: colors.income },
    {
      name: "Expenses",
      base: afterIncome,
      value: -totalExpenses,
      fill: colors.expense,
    },
    {
      name: "Investments",
      base: afterExpenses,
      value: -totalInvestments,
      fill: colors.investment,
    },
    { name: "End", base: 0, value: endBalance, fill: colors.end },
  ];

  const maxY = Math.max(s, afterIncome, afterExpenses, endBalance, 1);
  const minY = Math.min(0, endBalance, afterExpenses);

  // Match chart container background so "base" bar is invisible
  const baseBarFill = "var(--background)";

  const formatTooltip = (
    value: number | undefined,
    dataKey: string | number | undefined,
    props: { payload?: { name?: string } } | undefined,
  ) => {
    if (dataKey === "base") return null;
    const label = props?.payload?.name ?? String(dataKey);
    const safeValue = value ?? 0;
    if (label === "Start" || label === "End") {
      return [formatCur(safeValue, currency), label];
    }
    return [
      safeValue >= 0
        ? `+${formatCur(safeValue, currency)}`
        : formatCur(safeValue, currency),
      label,
    ];
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        Cashflow waterfall
      </h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 8, bottom: 24 }}
            barGap={0}
            barCategoryGap="16%"
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              className="text-slate-700 dark:text-slate-300"
            />
            <YAxis
              domain={[minY, maxY]}
              tickFormatter={(v) => formatCur(v, currency)}
              tick={{ fontSize: 10 }}
              className="text-slate-600 dark:text-slate-400"
            />
            <Tooltip
              formatter={(
                value: number | undefined,
                dataKey: string | number | undefined,
                props: { payload?: { name?: string } } | undefined,
              ) => formatTooltip(value, dataKey, props)}
              wrapperStyle={{
                outline: "none",
                background: "var(--card-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
              }}
              contentStyle={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                border: "none",
                padding: 0,
              }}
              labelStyle={{ color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <ReferenceLine y={0} stroke="currentColor" className="opacity-30" />
            {/* Draw value bar first, then base: in Recharts first Bar = bottom of stack. So bottom = value (0→s for Start, 0→income for Income...), top = base. We need bottom = base, top = value. So we put BASE first, VALUE second. */}
            <Bar
              dataKey="base"
              stackId="wf"
              fill={baseBarFill}
              maxBarSize={48}
              isAnimationActive={false}
            />
            <Bar
              dataKey="value"
              stackId="wf"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
