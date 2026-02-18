"use client";

import { useRef } from "react";

export function ClearMonthForm({
  year,
  month,
  monthLabel,
  clearMonthPlan,
  clearMonthActuals,
}: {
  year: number;
  month: number;
  monthLabel: string;
  clearMonthPlan: (formData: FormData) => Promise<void>;
  clearMonthActuals: (formData: FormData) => Promise<void>;
}) {
  const planFormRef = useRef<HTMLFormElement>(null);
  const actualsFormRef = useRef<HTMLFormElement>(null);

  function handleClearPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm(`Clear all plan for ${monthLabel}? This cannot be undone.`))
      return;
    const form = planFormRef.current;
    if (!form) return;
    clearMonthPlan(new FormData(form));
  }

  function handleClearActuals(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !confirm(`Clear all actuals for ${monthLabel}? This cannot be undone.`)
    )
      return;
    const form = actualsFormRef.current;
    if (!form) return;
    clearMonthActuals(new FormData(form));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form ref={planFormRef} onSubmit={handleClearPlan} className="inline">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-red-600 transition hover:bg-red-50 dark:border-slate-600 dark:bg-slate-700 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          Clear plan
        </button>
      </form>
      <form
        ref={actualsFormRef}
        onSubmit={handleClearActuals}
        className="inline"
      >
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-red-600 transition hover:bg-red-50 dark:border-slate-600 dark:bg-slate-700 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          Clear actuals
        </button>
      </form>
    </div>
  );
}
