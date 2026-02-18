"use client";

import { useRouter, useSearchParams } from "next/navigation";

function monthLabel(m: number) {
  return new Date(2000, m - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
}

type ViewType = "full" | "month" | "ytd" | "range";

export function DashboardPeriodSelector({
  year,
  view,
  month,
  monthFrom,
  monthTo,
  hideEmpty,
}: {
  year: number;
  view: ViewType;
  month: number;
  monthFrom: number;
  monthTo: number;
  hideEmpty: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(year));
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.push(`/dashboard?${params.toString()}`);
  };

  const hideEmptyToggleUrl = (() => {
    const params = new URLSearchParams(searchParams.toString());
    if (hideEmpty) params.delete("hideEmpty");
    else params.set("hideEmpty", "1");
    return `/dashboard?${params.toString()}`;
  })();

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="text-slate-800 dark:text-slate-300">View</label>
      <select
        value={view}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500"
        onChange={(e) =>
          update({ view: e.target.value, month: "", monthFrom: "", monthTo: "" })
        }
      >
        <option value="full">Full year</option>
        <option value="month">Single month</option>
        <option value="ytd">Year to date</option>
        <option value="range">Month range</option>
      </select>

      {view === "month" && (
        <select
          value={month}
className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        onChange={(e) => update({ month: e.target.value })}
      >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      )}

      {view === "ytd" && (
        <select
          value={month}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          onChange={(e) => update({ month: e.target.value })}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              Jan – {monthLabel(m)}
            </option>
          ))}
        </select>
      )}

      {view === "range" && (
        <>
          <select
            value={monthFrom}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            onChange={(e) => update({ monthFrom: e.target.value })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <span className="text-slate-800 dark:text-slate-300">to</span>
          <select
            value={monthTo}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            onChange={(e) => update({ monthTo: e.target.value })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </>
      )}

      <a
        href={hideEmptyToggleUrl}
        className="ml-2 flex items-center gap-1.5 text-slate-800 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
      >
        <span
          className={`inline-block h-3 w-3 rounded border border-slate-300 dark:border-slate-600 ${
            hideEmpty ? "bg-[#00e676]" : "bg-slate-100 dark:bg-slate-600"
          }`}
        />
        <span>
          {hideEmpty ? "Show all categories" : "Hide categories with no actuals"}
        </span>
      </a>
    </div>
  );
}
