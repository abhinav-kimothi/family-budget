"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { useChartColors } from "@/hooks/useChartColors";

function formatCur(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardProgressCharts({
  totalIncome,
  totalExpenses,
  totalInvestments,
  totalNet,
  budgetIncome,
  budgetExpenses,
  budgetInvestments,
  budgetNet,
  currency,
}: {
  totalIncome: number;
  totalExpenses: number;
  totalInvestments: number;
  totalNet: number;
  budgetIncome: number;
  budgetExpenses: number;
  budgetInvestments: number;
  budgetNet: number;
  currency: string;
}) {
  const colors = useChartColors();
  const data = [
    {
      name: "Income",
      plan: budgetIncome,
      actual: totalIncome,
    },
    {
      name: "Expenses",
      plan: budgetExpenses,
      actual: totalExpenses,
    },
    {
      name: "Investments",
      plan: budgetInvestments,
      actual: totalInvestments,
    },
    {
      name: "Net",
      plan: budgetNet,
      actual: totalNet,
    },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        Progress vs target
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 48, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="opacity-20"
            />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCur(v, currency)}
              tick={{ fontSize: 10 }}
              className="text-slate-600 dark:text-slate-400"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={44}
              tick={{ fontSize: 11 }}
              className="text-slate-700 dark:text-slate-300"
            />
            <Tooltip
              formatter={(value: number | undefined) =>
                formatCur(value ?? 0, currency)
              }
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--foreground)",
              }}
              labelStyle={{ color: "var(--foreground)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(label) => (
                <span className="text-slate-700 dark:text-slate-300">
                  {label}
                </span>
              )}
            />
            <Bar
              dataKey="plan"
              name="Target"
              fill={colors.plan}
              radius={[0, 2, 2, 0]}
              maxBarSize={20}
            />
            <Bar
              dataKey="actual"
              name="Actual"
              fill={colors.actual}
              radius={[0, 2, 2, 0]}
              maxBarSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
