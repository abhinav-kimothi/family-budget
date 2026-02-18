"use client";

import { useRouter, useSearchParams } from "next/navigation";

function monthLabel(m: number) {
  return new Date(2000, m - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
}

export function MonthYearNav({
  selectedYear,
  selectedMonth,
}: {
  selectedYear: number;
  selectedMonth: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const year = e.target.value ? Number(e.target.value) : new Date().getFullYear();
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(year));
    params.set("month", String(selectedMonth));
    router.push(`/entries?${params.toString()}`);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const month = Number(e.target.value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(selectedYear));
    params.set("month", String(month));
    router.push(`/entries?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
      <div className="flex items-center gap-2">
        <label className="text-slate-700 dark:text-slate-300" htmlFor="nav-year">
          Year
        </label>
        <input
          id="nav-year"
          type="number"
          value={selectedYear}
          onChange={handleYearChange}
          className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-slate-700 dark:text-slate-300" htmlFor="nav-month">
          Month
        </label>
        <select
          id="nav-month"
          value={selectedMonth}
          onChange={handleMonthChange}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
