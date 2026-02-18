"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

const SUCCESS = "#00E676";
const MUTED = "rgba(255,255,255,0.08)";

type DataPoint = { month: string; balance: number; net: number };

function formatCur(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardCashflowAreaChart({
  data,
  currency,
}: {
  data: DataPoint[];
  currency: string;
}) {
  const formatCurrency = (n: number) => formatCur(n, currency);
  if (!data.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
    >
      <h3 className="mb-4 text-sm font-semibold tracking-tight text-slate-900">
        Running balance
      </h3>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SUCCESS} stopOpacity={0.4} />
                <stop offset="100%" stopColor={SUCCESS} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
            />
            <YAxis
              hide
              domain={["dataMin - 100", "dataMax + 100"]}
              type="number"
            />
            <Tooltip
              contentStyle={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value: number) => [formatCurrency(value), "Balance"]}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={SUCCESS}
              strokeWidth={2}
              fill="url(#balanceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
