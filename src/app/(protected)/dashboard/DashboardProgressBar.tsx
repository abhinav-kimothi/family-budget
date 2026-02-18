"use client";

import { motion } from "framer-motion";

const SUCCESS = "#00E676";
const WARNING = "#FF5252";

type MetricType = "income" | "expense" | "investment" | "net";

function formatVal(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardProgressBar({
  label,
  plan,
  actual,
  type,
  currency,
}: {
  label: string;
  plan: number;
  actual: number;
  type: MetricType;
  currency: string;
}) {
  const formatValue = (n: number) => formatVal(n, currency);
  const isIncome = type === "income" || type === "investment";
  const isExpense = type === "expense";
  const isNet = type === "net";

  let fillPct = 0;
  let isOverBudget = false;
  let barColor = SUCCESS;

  if (isNet) {
    if (actual >= 0) {
      barColor = SUCCESS;
      const maxVal = Math.max(actual, plan, 1);
      fillPct = (actual / maxVal) * 100;
    } else {
      barColor = WARNING;
      const maxVal = Math.max(Math.abs(actual), Math.abs(plan), 1);
      fillPct = (Math.abs(actual) / maxVal) * 100;
    }
  } else if (plan <= 0) {
    fillPct = actual > 0 ? 100 : 0;
    isOverBudget = isExpense && actual > 0;
    barColor = isExpense ? (actual > 0 ? WARNING : SUCCESS) : SUCCESS;
  } else {
    const ratio = actual / plan;
    fillPct = Math.min(150, ratio * 100);
    if (isIncome) {
      isOverBudget = actual < plan;
      barColor = actual >= plan ? SUCCESS : WARNING;
    } else if (isExpense) {
      isOverBudget = actual > plan;
      barColor = actual <= plan ? SUCCESS : WARNING;
    }
  }

  const displayBarPct = Math.min(100, fillPct);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
          {label}
        </span>
        <span className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatValue(actual)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-700">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${displayBarPct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-800 dark:text-slate-300">
        <span>Plan: {formatValue(plan)}</span>
        {(plan !== 0 || isNet) && (
          <span style={{ color: isOverBudget ? WARNING : SUCCESS }}>
            {(isIncome || type === "investment") && actual >= plan && "+"}
            {isExpense && actual <= plan && "+"}
            {formatValue(actual - plan)} vs plan
          </span>
        )}
      </div>
    </motion.div>
  );
}
