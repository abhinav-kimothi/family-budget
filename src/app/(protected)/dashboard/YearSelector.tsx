"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function YearSelector({ currentYear }: { currentYear: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const years = [];
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 5; y <= thisYear + 1; y++) {
    years.push(y);
  }

  return (
    <select
      id="year"
      name="year"
      value={currentYear}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500"
      onChange={(e) => {
        const year = e.target.value;
        const params = new URLSearchParams(searchParams.toString());
        params.set("year", year);
        router.push(`/dashboard?${params.toString()}`);
      }}
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
