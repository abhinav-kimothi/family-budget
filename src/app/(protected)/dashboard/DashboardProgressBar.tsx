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

function metricPresentation(args: {
  value: number;
  plan: number;
  type: MetricType;
}) {
  const { value, plan, type } = args;
  const isIncome = type === "income" || type === "investment";
  const isExpense = type === "expense";
  const isNet = type === "net";

  let fillPct = 0;
  let isOverBudget = false;
  let barColor = SUCCESS;

  if (isNet) {
    if (value >= 0) {
      barColor = SUCCESS;
      const maxVal = Math.max(value, plan, 1);
      fillPct = (value / maxVal) * 100;
    } else {
      barColor = WARNING;
      const maxVal = Math.max(Math.abs(value), Math.abs(plan), 1);
      fillPct = (Math.abs(value) / maxVal) * 100;
    }
  } else if (plan <= 0) {
    fillPct = value > 0 ? 100 : 0;
    isOverBudget = isExpense && value > 0;
    barColor = isExpense ? (value > 0 ? WARNING : SUCCESS) : SUCCESS;
  } else {
    const ratio = value / plan;
    fillPct = Math.min(150, ratio * 100);
    if (isIncome) {
      isOverBudget = value < plan;
      barColor = value >= plan ? SUCCESS : WARNING;
    } else if (isExpense) {
      isOverBudget = value > plan;
      barColor = value <= plan ? SUCCESS : WARNING;
    }
  }

  return {
    isIncome,
    isExpense,
    isNet,
    fillPct,
    displayBarPct: Math.min(100, fillPct),
    isOverBudget,
    barColor,
  };
}

export function DashboardProgressBar({
  label,
  plan,
  actual,
  type,
  currency,
  subLabel,
  comparisonLabel,
  comparisonValue,
  comparisonSubLabel,
}: {
  label: string;
  plan: number;
  actual: number;
  type: MetricType;
  currency: string;
  subLabel?: string;
  comparisonLabel?: string;
  comparisonValue?: number;
  comparisonSubLabel?: string;
}) {
  const formatValue = (n: number) => formatVal(n, currency);
  const primary = metricPresentation({ value: actual, plan, type });
  const comparison =
    comparisonValue != null
      ? metricPresentation({ value: comparisonValue, plan, type })
      : null;
  const primaryOverflow = primary.fillPct > 100.0001;
  const comparisonOverflow = comparison != null && comparison.fillPct > 100.0001;
  const accent =
    type === "income"
      ? {
          tint: "from-emerald-50 to-white dark:from-emerald-950/20 dark:to-slate-800",
          border: "border-emerald-200/70 dark:border-emerald-700/40",
          pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
        }
      : type === "expense"
        ? {
            tint: "from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-800",
            border: "border-amber-200/70 dark:border-amber-700/40",
            pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
          }
        : type === "investment"
          ? {
              tint: "from-sky-50 to-white dark:from-sky-950/20 dark:to-slate-800",
              border: "border-sky-200/70 dark:border-sky-700/40",
              pill: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
            }
          : {
              tint: "from-violet-50 to-white dark:from-violet-950/20 dark:to-slate-800",
              border: "border-violet-200/70 dark:border-violet-700/40",
              pill: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200",
            };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
      className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm transition-shadow hover:shadow-md dark:shadow-black/20 ${accent.tint} ${accent.border}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${accent.pill}`}>
            {label}
          </span>
          {subLabel ? (
            <div className="mt-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
              {subLabel}
            </div>
          ) : null}
        </div>
        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatValue(actual)}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full border border-slate-200/80 bg-white/80 dark:border-slate-600 dark:bg-slate-700/70">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${primary.displayBarPct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: primary.barColor }}
        />
        {primaryOverflow ? (
          <span
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] leading-none text-slate-900 dark:text-slate-100"
            title="Exceeds plan"
            aria-label="Exceeds plan"
          >
            *
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-700 dark:text-slate-300">
        <span>Plan: {formatValue(plan)}</span>
        {(plan !== 0 || primary.isNet) && (
          <span className="font-medium" style={{ color: primary.isOverBudget ? WARNING : SUCCESS }}>
            {primary.isIncome && actual >= plan && "+"}
            {primary.isExpense && actual <= plan && "+"}
            {formatValue(actual - plan)} vs plan
          </span>
        )}
      </div>
      {comparisonLabel != null && comparisonValue != null && comparison != null ? (
        <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-600 dark:bg-slate-800/70">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${accent.pill}`}>
                {comparisonLabel}
              </span>
              {comparisonSubLabel ? (
                <div className="mt-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                  {comparisonSubLabel}
                </div>
              ) : null}
            </div>
            <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatValue(comparisonValue)}
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full border border-slate-200/80 bg-white/80 dark:border-slate-600 dark:bg-slate-700/70">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${comparison.displayBarPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ backgroundColor: comparison.barColor }}
            />
            {comparisonOverflow ? (
              <span
                className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] leading-none text-slate-900 dark:text-slate-100"
                title="Exceeds plan"
                aria-label="Exceeds plan"
              >
                *
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-700 dark:text-slate-300">
            <span>Plan: {formatValue(plan)}</span>
            {(plan !== 0 || comparison.isNet) && (
              <span className="font-medium" style={{ color: comparison.isOverBudget ? WARNING : SUCCESS }}>
                {comparison.isIncome && comparisonValue >= plan && "+"}
                {comparison.isExpense && comparisonValue <= plan && "+"}
                {formatValue(comparisonValue - plan)} vs plan
              </span>
            )}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
