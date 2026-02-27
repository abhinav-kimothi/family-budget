"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const FLASH_QUERY_KEYS = [
  "upload",
  "cleared",
  "alloc",
  "planRebalanced",
  "planRebalancedRun",
  "planRebalancedNoChange",
  "bulkRebalanced",
  "bulkRebalancedMonths",
  "bulkRebalancedCutMonths",
  "bulkRebalancedTotalCut",
  "bulkRebalancedUnresolvedMonths",
  "rebalancedCount",
  "rebalancedCut",
  "rebalancedResidualDeficit",
] as const;

export function EntriesFlashQueryCleanup({
  delayMs = 4500,
}: {
  delayMs?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const hasFlashParams = FLASH_QUERY_KEYS.some((key) => searchParams.has(key));
    if (!hasFlashParams) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      let changed = false;
      for (const key of FLASH_QUERY_KEYS) {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
      }
      if (!changed) return;
      const query = params.toString();
      router.replace(query ? `/entries?${query}` : "/entries", { scroll: false });
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, router, searchParams]);

  return null;
}

