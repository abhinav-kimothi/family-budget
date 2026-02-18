"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useChartColors } from "@/hooks/useChartColors";

export type TrendPoint = {
  month: string;
  income: number;
  expenses: number;
  investments: number;
  net: number;
  prevIncome: number | null;
  prevExpenses: number | null;
  prevInvestments: number | null;
  prevNet: number | null;
};

function formatCur(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function pctChange(current: number, previous: number | null): string | null {
  if (previous == null || previous === 0) return current === 0 ? null : "new";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (pct === 0) return "0%";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function CustomTooltip(props: {
  active?: boolean;
  payload?: Array<{ payload: TrendPoint }>;
  label?: string;
  currency: string;
}) {
  const { active, payload, label, currency } = props;
  if (!active || !payload?.length || !label) return null;

  const row = payload[0].payload;
  const metrics = [
    {
      name: "Income",
      current: row.income,
      prev: row.prevIncome,
      dataKey: "income",
    },
    {
      name: "Expenses",
      current: row.expenses,
      prev: row.prevExpenses,
      dataKey: "expenses",
    },
    {
      name: "Investments",
      current: row.investments,
      prev: row.prevInvestments,
      dataKey: "investments",
    },
    {
      name: "Net",
      current: row.net,
      prev: row.prevNet,
      dataKey: "net",
    },
  ];

  return (
    <div
      className="rounded-lg border shadow-lg dark:border-slate-600"
      style={{
        borderColor: "var(--border)",
        background: "var(--card-bg)",
        color: "var(--foreground)",
        minWidth: "380px",
        padding: "16px 20px",
      }}
    >
      <p className="mb-4 text-base font-semibold" style={{ color: "var(--foreground)" }}>
        {label}
      </p>
      <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: "0 6px" }}>
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <th className="text-left pb-2 pr-4">Metric</th>
            <th className="text-right pb-2 pr-4">Current</th>
            <th className="text-right pb-2 pr-4">Previous month</th>
            <th className="text-right pb-2">Change</th>
          </tr>
        </thead>
        <tbody className="text-sm" style={{ color: "var(--foreground)" }}>
          {metrics.map((m) => {
            const change = pctChange(m.current, m.prev);
            return (
              <tr key={m.dataKey} className="text-slate-700 dark:text-slate-300">
                <td className="py-2 pr-4">{m.name}</td>
                <td className="py-2 text-right tabular-nums pr-4">
                  {formatCur(m.current, currency)}
                </td>
                <td className="py-2 text-right tabular-nums pr-4">
                  {m.prev != null ? formatCur(m.prev, currency) : "–"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {change ?? "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardTrendLineChart({
  data,
  currency,
}: {
  data: TrendPoint[];
  currency: string;
}) {
  const colors = useChartColors();
  if (!data.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        Trend: actual values vs previous period
      </h2>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 8, bottom: 24 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="opacity-20"
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10 }}
              className="text-slate-600 dark:text-slate-400"
            />
            <YAxis
              tickFormatter={(v) => formatCur(v, currency)}
              tick={{ fontSize: 10 }}
              className="text-slate-600 dark:text-slate-400"
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip {...props} currency={currency} />
              )}
            />
            <ReferenceLine
              y={0}
              stroke="currentColor"
              strokeDasharray="2 2"
              className="opacity-40"
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(label) => (
                <span className="text-slate-700 dark:text-slate-300">
                  {label}
                </span>
              )}
            />
            <Line
              type="monotone"
              dataKey="income"
              name="Income"
              stroke={colors.income}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke={colors.expense}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="investments"
              name="Investments"
              stroke={colors.investment}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke={colors.net}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
