"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export function PersistentDetails({
  storageKey,
  defaultOpen = false,
  className = "",
  summary,
  children,
  openOverride,
}: {
  storageKey: string;
  defaultOpen?: boolean;
  className?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
  openOverride?: boolean;
}) {
  const pathname = usePathname();
  const scopedKey = useMemo(
    () => `persistent-details:${pathname}:${storageKey}`,
    [pathname, storageKey],
  );
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(scopedKey);
      if (raw === "1") setOpen(true);
      else if (raw === "0") setOpen(false);
      else setOpen(defaultOpen);
    } catch {
      setOpen(defaultOpen);
    } finally {
      setHydrated(true);
    }
  }, [defaultOpen, scopedKey]);

  useEffect(() => {
    if (openOverride === true) {
      setOpen(true);
    }
  }, [openOverride]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(scopedKey, open ? "1" : "0");
    } catch {
      // no-op
    }
  }, [hydrated, open, scopedKey]);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className={className}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

