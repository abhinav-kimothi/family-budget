"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const storageKey = useMemo(
    () => `collapsible-section:${pathname}:${title}`,
    [pathname, title],
  );
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "1") setOpen(true);
      else if (raw === "0") setOpen(false);
      else setOpen(defaultOpen);
    } catch {
      setOpen(defaultOpen);
    }
  }, [defaultOpen, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      // no-op
    }
  }, [open, storageKey]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-800 transition hover:from-slate-100 hover:to-white dark:border-slate-600 dark:from-slate-700 dark:to-slate-800 dark:text-slate-300 dark:hover:from-slate-600 dark:hover:to-slate-800"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--brand-primary)" }}
            aria-hidden
          />
          {title}
        </span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-center text-[11px] shadow-sm dark:border-slate-600 dark:bg-slate-700" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="p-4">{children}</div>
      ) : null}
    </div>
  );
}
