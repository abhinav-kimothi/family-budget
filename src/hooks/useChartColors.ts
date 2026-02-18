"use client";

import { useEffect, useState } from "react";

function getComputedChartColors() {
  if (typeof document === "undefined") {
    return {
      plan: "#94a3b8",
      actual: "#059669",
      income: "#059669",
      expense: "#dc2626",
      investment: "#d97706",
      net: "#0284c7",
      start: "#64748b",
      end: "#0284c7",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    plan: get("--chart-plan", "#94a3b8"),
    actual: get("--chart-actual", "#059669"),
    income: get("--chart-income", "#059669"),
    expense: get("--chart-expense", "#dc2626"),
    investment: get("--chart-investment", "#d97706"),
    net: get("--chart-net", "#0284c7"),
    start: get("--chart-start", "#64748b"),
    end: get("--chart-end", "#0284c7"),
  };
}

export function useChartColors() {
  const [colors, setColors] = useState(getComputedChartColors);

  useEffect(() => {
    const update = () => setColors(getComputedChartColors());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}
