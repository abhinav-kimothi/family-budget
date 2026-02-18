"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";

const COLORS = ["#00E676", "#FF5252", "#03A9F4"]; // Income, Expense, Investment

type Segment = { name: string; value: number };

function formatCur(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardDonutChart({
  data,
  currency,
}: {
  data: Segment[];
  currency: string;
}) {
  const formatCurrency = (n: number) => formatCur(n, currency);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[240px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl"
      >
        <p className="text-xs text-slate-700">No data for period</p>
      </motion.div>
    );
  }

  const chartData = data.map((d) => ({ ...d, value: Math.max(0, d.value) })).filter((d) => d.value > 0);
  if (!chartData.length) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[240px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl"
      >
        <p className="text-xs text-slate-700">No data for period</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
    >
      <h3 className="mb-2 text-sm font-semibold tracking-tight text-slate-900">
        Split
      </h3>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={72}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value: number) => formatCurrency(value)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px]">
        {chartData.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {d.name}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
