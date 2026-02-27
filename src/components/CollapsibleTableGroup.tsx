"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export function CollapsibleTableGroup({
  title,
  defaultOpen = false,
  colSpan = 3,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  colSpan?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const storageKey = useMemo(
    () => `collapsible-table-group:${pathname}:${title}`,
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

  // Always render children so form inputs stay in the DOM when collapsed.
  // When collapsed, hide the rows visually so submitted form data includes all categories.
  const renderedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement<{ className?: string }>(child) && !open) {
      const existingClassName =
        typeof child.props.className === "string" ? child.props.className : "";
      return React.cloneElement(child, {
        className: [existingClassName, "hidden"].filter(Boolean).join(" "),
      });
    }
    return child;
  });

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="cursor-pointer border-t border-slate-100 bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-800 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        aria-expanded={open}
      >
        <td className="px-4 py-2" colSpan={colSpan}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 text-center" aria-hidden>
              {open ? "▾" : "▸"}
            </span>
            {title}
          </span>
        </td>
      </tr>
      {renderedChildren}
    </>
  );
}
