"use client";

import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";

type PulseExportData = {
  meta: {
    title: string;
    periodLabel: string;
    view: string;
    year: number;
    user: string;
    currency: string;
    monthsInScope: number[];
    generatedAt: string;
  };
  summary: {
    income: {
      plan: number;
      actual: number;
      ytdTotal: number;
      averageMonthly: number;
    };
    expenses: {
      plan: number;
      actual: number;
      recognized: number;
      ytdTotalActual: number;
      ytdTotalRecognized: number;
      averageMonthlyActual: number;
      averageMonthlyRecognized: number;
    };
    investments: {
      plan: number;
      actual: number;
      ytdTotal: number;
      averageMonthly: number;
    };
    netCashflow: {
      plan: number;
      actual: number;
      recognized: number;
      ytdTotalActual: number;
      ytdTotalRecognized: number;
      averageMonthlyActual: number;
      averageMonthlyRecognized: number;
    };
  };
  balances: {
    cash: { starting: number; ending: number };
    investable: { starting: number; ending: number };
  };
  needTierMix: Array<{
    tierKey: string;
    tierLabel: string;
    actual: number;
    recognized: number;
  }>;
  monthlyBreakdown: Array<{
    month: number;
    monthLabel: string;
    income: number;
    expensesPlan: number;
    expensesActual: number;
    expensesRecognized: number;
    investmentsPlan: number;
    investmentsActual: number;
    netPlan: number;
    netActual: number;
    netRecognized: number;
    balance: number;
  }>;
  annualBudgetRemaining: Array<{
    categoryName: string;
    annualBudget: number;
    spentActualYtd: number;
    spentRecognizedYtd: number;
    remainingActual: number;
    remainingRecognized: number;
  }>;
  categoryTotals: Array<{
    categoryName: string;
    type: "INCOME" | "EXPENSE" | "INVESTMENT";
    plan: number;
    actual: number;
    recognized: number;
    diffVsActual: number;
    diffVsRecognized: number | null;
    needTierFlags:
      | {
          nonEssential?: "partial" | "full";
          travel?: "partial" | "full";
          luxury?: "partial" | "full";
        }
      | null;
  }>;
  insights: Array<{
    severity: "info" | "warn" | "good";
    title: string;
    detail: string;
    recommendation: string;
  }>;
};

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function autoWidthColumns(worksheet: any, minWidth = 12, maxWidth = 42) {
  const widths: number[] = [];
  worksheet.eachRow((row: any) => {
    row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
      const raw = cell.value;
      const text =
        raw == null
          ? ""
          : typeof raw === "object" && raw.richText
            ? raw.richText.map((p: any) => p.text).join("")
            : String(raw);
      widths[colNumber - 1] = Math.max(widths[colNumber - 1] ?? minWidth, text.length + 2);
    });
  });
  worksheet.columns.forEach((col: any, idx: number) => {
    col.width = Math.min(maxWidth, Math.max(minWidth, widths[idx] ?? minWidth));
  });
}

function deriveExpenseSummaryBoxes(categoryTotals: PulseExportData["categoryTotals"]) {
  const expenseRows = categoryTotals.filter((r) => r.type === "EXPENSE");
  const topOverBudget = expenseRows
    .map((r) => {
      const over = r.recognized - r.plan;
      const utilizationPct = r.plan > 0 ? (r.recognized / r.plan) * 100 : r.recognized > 0 ? 100 : 0;
      return { ...r, over, utilizationPct };
    })
    .filter((r) => r.plan > 0 && r.over > 0.0001)
    .sort((a, b) => b.over - a.over)
    .slice(0, 2);

  const leastUtilized = expenseRows
    .map((r) => {
      const utilizationPct = r.plan > 0 ? (r.recognized / r.plan) * 100 : Infinity;
      const remaining = r.plan - r.recognized;
      return { ...r, utilizationPct, remaining };
    })
    .filter((r) => r.plan > 0 && r.recognized <= r.plan + 0.0001)
    .sort((a, b) => {
      if (a.utilizationPct !== b.utilizationPct) return a.utilizationPct - b.utilizationPct;
      return b.remaining - a.remaining;
    })
    .slice(0, 2);

  return { topOverBudget, leastUtilized };
}

async function exportPulsePdf(filenameBase: string, targetId: string) {
  const EXPORT_WIDTH_PX = 1040;
  const element = document.getElementById(targetId);
  if (!element) {
    throw new Error("Pulse report root not found");
  }
  const colorCanvas = document.createElement("canvas");
  const colorCtx = colorCanvas.getContext("2d");
  const normalizeColor = (value: string) => {
    if (!value || !colorCtx) return value;
    const trimmed = value.trim().toLowerCase();
    if (
      trimmed === "" ||
      trimmed === "transparent" ||
      trimmed === "initial" ||
      trimmed === "inherit" ||
      trimmed === "currentcolor" ||
      trimmed === "none"
    ) {
      return value;
    }
    try {
      colorCanvas.width = 1;
      colorCanvas.height = 1;
      colorCtx.clearRect(0, 0, 1, 1);
      colorCtx.fillStyle = "rgba(0,0,0,0)";
      colorCtx.fillStyle = value;
      colorCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    } catch {
      return value;
    }
  };

  const exportHost = document.createElement("div");
  exportHost.setAttribute("data-pulse-export-host", "true");
  exportHost.style.position = "fixed";
  exportHost.style.left = "-20000px";
  exportHost.style.top = "0";
  exportHost.style.width = `${EXPORT_WIDTH_PX}px`;
  exportHost.style.zIndex = "-1";
  exportHost.style.pointerEvents = "none";
  exportHost.style.background = "#ffffff";
  exportHost.style.padding = "0";

  const exportRoot = element.cloneNode(true) as HTMLElement;
  exportRoot.id = `${targetId}__export`;
  exportRoot.classList.add("pulse-export-clone");
  exportRoot.style.width = `${EXPORT_WIDTH_PX}px`;
  exportRoot.style.maxWidth = `${EXPORT_WIDTH_PX}px`;
  exportRoot.style.minWidth = `${EXPORT_WIDTH_PX}px`;
  exportRoot.style.margin = "0";
  exportRoot.style.transform = "none";

  const sourceNodes = [element, ...Array.from(element.querySelectorAll("*"))] as Array<
    HTMLElement | SVGElement
  >;
  const cloneNodes = [exportRoot, ...Array.from(exportRoot.querySelectorAll("*"))] as Array<
    HTMLElement | SVGElement
  >;
  const propShouldNormalizeColor = (prop: string) =>
    prop === "color" || prop.endsWith("color") || prop === "fill" || prop === "stroke";
  const skipLayoutProps = new Set([
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "max-height",
    "inline-size",
    "min-inline-size",
    "max-inline-size",
    "block-size",
    "min-block-size",
    "max-block-size",
    "left",
    "right",
    "top",
    "bottom",
    "inset",
    "inset-inline",
    "inset-block",
    "inset-inline-start",
    "inset-inline-end",
    "inset-block-start",
    "inset-block-end",
  ]);

  for (let i = 0; i < Math.min(sourceNodes.length, cloneNodes.length); i += 1) {
    const src = sourceNodes[i];
    const dst = cloneNodes[i];
    if (!(src instanceof Element) || !(dst instanceof Element)) continue;

    const cs = window.getComputedStyle(src);
    const styleTarget = (dst as HTMLElement | SVGElement).style;

    for (const prop of Array.from(cs)) {
      if (!prop || prop.startsWith("--")) continue;
      if (skipLayoutProps.has(prop)) continue;
      let value = cs.getPropertyValue(prop);
      if (!value) continue;

      if (/(oklab|oklch)/i.test(value)) {
        if (propShouldNormalizeColor(prop)) {
          value = normalizeColor(value);
        } else if (prop.includes("shadow") || prop === "filter" || prop === "backdrop-filter") {
          value = "none";
        } else if (prop === "background" || prop === "background-image") {
          value = prop === "background-image" ? "none" : normalizeColor(cs.backgroundColor);
        } else {
          continue;
        }
      }

      if (prop === "background-image" && /(gradient)/i.test(value)) {
        value = "none";
      }
      if (prop.includes("shadow")) {
        value = "none";
      }
      if (prop === "animation" || prop === "transition") {
        value = "none";
      }

      styleTarget.setProperty(prop, value);
    }

    styleTarget.setProperty("color", normalizeColor(cs.color));
    styleTarget.setProperty("background-color", normalizeColor(cs.backgroundColor));
    styleTarget.setProperty("border-top-color", normalizeColor(cs.borderTopColor));
    styleTarget.setProperty("border-right-color", normalizeColor(cs.borderRightColor));
    styleTarget.setProperty("border-bottom-color", normalizeColor(cs.borderBottomColor));
    styleTarget.setProperty("border-left-color", normalizeColor(cs.borderLeftColor));
    styleTarget.setProperty("outline-color", normalizeColor(cs.outlineColor));
    styleTarget.setProperty("text-decoration-color", normalizeColor(cs.textDecorationColor));
    styleTarget.setProperty("caret-color", normalizeColor(cs.caretColor));
    styleTarget.setProperty("box-shadow", "none");
    styleTarget.setProperty("text-shadow", "none");
    styleTarget.setProperty("filter", "none");

    if (dst instanceof HTMLElement) {
      dst.dataset.pulseExportCloned = "true";
      const className = typeof dst.className === "string" ? dst.className : "";
      if (className.includes("rounded-2xl") || className.includes("rounded-xl")) {
        dst.classList.add("pulse-export-avoid-break");
      }
      if (dst.dataset.pulseExportIgnore === "true") {
        dst.remove();
        continue;
      }
      dst.style.maxWidth = "100%";
      dst.style.minWidth = "0";
    }
  }

  // Remove ignored controls and interactive-only elements from the export clone.
  for (const ignored of Array.from(exportRoot.querySelectorAll('[data-pulse-export-ignore="true"]'))) {
    ignored.remove();
  }

  // Avoid sticky positioning artifacts in exported layout.
  for (const el of Array.from(exportRoot.querySelectorAll("*"))) {
    if (!(el instanceof HTMLElement)) continue;
    const cs = window.getComputedStyle(el);
    if (cs.position === "sticky" || cs.position === "fixed") {
      el.style.position = "static";
      el.style.top = "auto";
      el.style.left = "auto";
      el.style.right = "auto";
      el.style.bottom = "auto";
    }

    // PDF-specific compacting to reduce overflow and large whitespace.
    if (el.tagName === "SECTION") {
      el.style.breakInside = "auto";
      (el.style as any).pageBreakInside = "auto";
      el.style.marginBottom = "12px";
    }
    if (el.className.includes("rounded-2xl")) {
      el.style.borderRadius = "12px";
    }
    if (el.className.includes("rounded-xl")) {
      el.style.borderRadius = "10px";
    }
    if (el.className.includes("space-y-8")) {
      el.style.gap = "16px";
    }
    if (el.className.includes("gap-4")) {
      el.style.gap = "12px";
    }
    if (el.className.includes("gap-3")) {
      el.style.gap = "10px";
    }
    if (el.className.includes("p-4")) {
      el.style.padding = "12px";
    }
    if (el.className.includes("px-4")) {
      el.style.paddingLeft = "12px";
      el.style.paddingRight = "12px";
    }
    if (el.className.includes("py-8")) {
      el.style.paddingTop = "12px";
      el.style.paddingBottom = "12px";
    }
    if (el.className.includes("text-2xl")) {
      el.style.fontSize = "26px";
      el.style.lineHeight = "1.15";
    }
    if (el.className.includes("md:text-3xl")) {
      el.style.fontSize = "26px";
    }
    if (el.className.includes("text-base")) {
      el.style.fontSize = "14px";
    }
    if (el.className.includes("text-sm")) {
      el.style.fontSize = "12px";
    }
    if (el.className.includes("text-xs")) {
      el.style.fontSize = "11px";
    }
    if (el.className.includes("text-[11px]")) {
      el.style.fontSize = "10px";
    }
    if (el.className.includes("text-[10px]")) {
      el.style.fontSize = "9px";
    }
    // Force dashboard top KPI grid to a printable 3-column layout.
    if (el.tagName === "SECTION" && el.className.includes("md:grid-cols-3")) {
      el.style.display = "grid";
      el.style.gridTemplateColumns = "1fr 1fr 1fr";
      el.style.alignItems = "start";
    }
    // Force need-tier tiles to 2x2 printable layout to avoid clipping.
    if (el.className.includes("xl:grid-cols-4") && el.className.includes("sm:grid-cols-2")) {
      el.style.display = "grid";
      el.style.gridTemplateColumns = "1fr 1fr";
    }
    // Make wide tables scroll containers render full width instead of clipping.
    if (cs.overflowX === "auto" || el.className.includes("overflow-x-auto")) {
      el.style.overflowX = "visible";
      el.style.maxWidth = "100%";
    }
    if (el.tagName === "TABLE") {
      el.style.width = "100%";
      el.style.tableLayout = "fixed";
      el.style.fontSize = "10px";
    }
    if (el.tagName === "TH" || el.tagName === "TD") {
      el.style.whiteSpace = "normal";
      el.style.wordBreak = "break-word";
      el.style.overflowWrap = "anywhere";
      el.style.padding = "6px 8px";
    }
    if (el.tagName === "SELECT") {
      el.style.maxWidth = "100%";
    }
  }

  exportHost.appendChild(exportRoot);
  document.body.appendChild(exportHost);

  const liveStylesheets = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  ) as Array<HTMLStyleElement | HTMLLinkElement>;
  const priorDisabled = liveStylesheets.map((n) => Boolean((n as any).disabled));
  for (const sheetNode of liveStylesheets) {
    try {
      (sheetNode as any).disabled = true;
    } catch {
      // ignore
    }
  }
  try {
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: `${safeSlug(filenameBase)}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 1.6,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: EXPORT_WIDTH_PX,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: {
          mode: ["css", "legacy"],
          avoid: [".pulse-export-avoid-break"],
          before: ["[data-pulse-export-section-break='true']"],
        },
      })
      .from(exportRoot)
      .save();
  } finally {
    liveStylesheets.forEach((node, idx) => {
      try {
        (node as any).disabled = priorDisabled[idx];
      } catch {
        // ignore
      }
    });
    exportHost.remove();
  }
}

async function exportPulseExcel(data: PulseExportData, filenameBase: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.created = new Date();
  workbook.modified = new Date();

  const currencyFmt = '#,##0.00';

  const overview = workbook.addWorksheet("Overview");
  overview.addRow(["Pulse Report"]);
  overview.addRow(["Period", data.meta.periodLabel]);
  overview.addRow(["View", data.meta.view]);
  overview.addRow(["Year", data.meta.year]);
  overview.addRow(["User", data.meta.user]);
  overview.addRow(["Currency", data.meta.currency]);
  overview.addRow(["Generated At", new Date(data.meta.generatedAt).toLocaleString()]);
  overview.addRow([]);
  overview.addRow([
    "Metric",
    "Plan",
    "Actual",
    "Recognized",
    "YTD Total (Actual)",
    "YTD Total (Recognized)",
    "Average Monthly (Actual)",
    "Average Monthly (Recognized)",
  ]);

  const rows = [
    [
      "Income",
      data.summary.income.plan,
      data.summary.income.actual,
      null,
      data.summary.income.ytdTotal,
      null,
      data.summary.income.averageMonthly,
      null,
    ],
    [
      "Expenses",
      data.summary.expenses.plan,
      data.summary.expenses.actual,
      data.summary.expenses.recognized,
      data.summary.expenses.ytdTotalActual,
      data.summary.expenses.ytdTotalRecognized,
      data.summary.expenses.averageMonthlyActual,
      data.summary.expenses.averageMonthlyRecognized,
    ],
    [
      "Investments",
      data.summary.investments.plan,
      data.summary.investments.actual,
      null,
      data.summary.investments.ytdTotal,
      null,
      data.summary.investments.averageMonthly,
      null,
    ],
    [
      "Net Cashflow",
      data.summary.netCashflow.plan,
      data.summary.netCashflow.actual,
      data.summary.netCashflow.recognized,
      data.summary.netCashflow.ytdTotalActual,
      data.summary.netCashflow.ytdTotalRecognized,
      data.summary.netCashflow.averageMonthlyActual,
      data.summary.netCashflow.averageMonthlyRecognized,
    ],
  ];
  rows.forEach((r) => overview.addRow(r));
  overview.addRow([]);
  overview.addRow(["Balance Type", "Starting", "Ending"]);
  overview.addRow(["Cash", data.balances.cash.starting, data.balances.cash.ending]);
  overview.addRow(["Investable", data.balances.investable.starting, data.balances.investable.ending]);
  overview.addRow([]);
  overview.addRow(["Need Tier", "Actual", "Recognized", "Delta"]);
  data.needTierMix.forEach((t) => {
    overview.addRow([t.tierLabel, t.actual, t.recognized, t.recognized - t.actual]);
  });

  const headerRows = new Set([1, 9, 15, 19]);
  overview.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.font = { bold: true, size: 14 };
      return;
    }
    if (headerRows.has(rowNumber)) {
      row.font = { bold: true, color: { argb: "FFFFFFFF" } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    }
  });
  [2, 3, 4, 5, 6, 7, 8].forEach((col) => {
    overview.getColumn(col).numFmt = currencyFmt;
  });
  autoWidthColumns(overview);

  const monthly = workbook.addWorksheet("Monthly Breakdown");
  monthly.addRow([
    "Month",
    "Income",
    "Expenses Plan",
    "Expenses Actual",
    "Expenses Recognized",
    "Investments Plan",
    "Investments Actual",
    "Net Plan",
    "Net Actual",
    "Net Recognized",
    "End Cash Balance",
  ]);
  data.monthlyBreakdown.forEach((m) =>
    monthly.addRow([
      `${m.monthLabel} ${data.meta.year}`,
      m.income,
      m.expensesPlan,
      m.expensesActual,
      m.expensesRecognized,
      m.investmentsPlan,
      m.investmentsActual,
      m.netPlan,
      m.netActual,
      m.netRecognized,
      m.balance,
    ]),
  );
  monthly.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  monthly.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  for (let c = 2; c <= 11; c += 1) monthly.getColumn(c).numFmt = currencyFmt;
  monthly.views = [{ state: "frozen", ySplit: 1 }];
  autoWidthColumns(monthly);

  const category = workbook.addWorksheet("Category Totals");
  category.addRow([
    "Category",
    "Type",
    "Plan",
    "Actual",
    "Recognized",
    "Diff (vs Actual)",
    "Diff (vs Recognized)",
    "Tier Flags",
  ]);
  data.categoryTotals.forEach((r) => {
    const tierFlags = [
      r.needTierFlags?.nonEssential ? `NE (${r.needTierFlags.nonEssential})` : "",
      r.needTierFlags?.travel ? `Travel (${r.needTierFlags.travel})` : "",
      r.needTierFlags?.luxury ? `Luxury (${r.needTierFlags.luxury})` : "",
    ]
      .filter(Boolean)
      .join(", ");
    category.addRow([
      r.categoryName,
      r.type,
      r.plan,
      r.actual,
      r.recognized,
      r.diffVsActual,
      r.diffVsRecognized,
      tierFlags || null,
    ]);
  });
  category.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  category.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  for (let c = 3; c <= 7; c += 1) category.getColumn(c).numFmt = currencyFmt;
  category.views = [{ state: "frozen", ySplit: 1 }];
  autoWidthColumns(category);

  const { topOverBudget, leastUtilized } = deriveExpenseSummaryBoxes(data.categoryTotals);
  const expenseSummary = workbook.addWorksheet("Expense Budget Summary");
  expenseSummary.addRow(["Top Over Budget (Expenses)"]);
  expenseSummary.addRow([
    "Category",
    "Plan",
    "Actual",
    "Recognized",
    "Over Budget (Rec-Plan)",
    "Utilization %",
  ]);
  if (topOverBudget.length === 0) {
    expenseSummary.addRow(["No expense categories are above budget for this selection."]);
  } else {
    topOverBudget.forEach((r) => {
      expenseSummary.addRow([
        r.categoryName,
        r.plan,
        r.actual,
        r.recognized,
        r.over,
        r.utilizationPct / 100,
      ]);
    });
  }
  expenseSummary.addRow([]);
  expenseSummary.addRow(["Least Utilized Budget (Expenses)"]);
  expenseSummary.addRow([
    "Category",
    "Plan",
    "Actual",
    "Recognized",
    "Remaining (Plan-Rec)",
    "Utilization %",
  ]);
  if (leastUtilized.length === 0) {
    expenseSummary.addRow(["No expense categories with a positive budget found for this selection."]);
  } else {
    leastUtilized.forEach((r) => {
      expenseSummary.addRow([
        r.categoryName,
        r.plan,
        r.actual,
        r.recognized,
        r.remaining,
        r.utilizationPct / 100,
      ]);
    });
  }
  [2, 3, 4, 5].forEach((c) => {
    expenseSummary.getColumn(c).numFmt = currencyFmt;
  });
  [6].forEach((c) => {
    expenseSummary.getColumn(c).numFmt = "0.00%";
  });
  expenseSummary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  expenseSummary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBE123C" } };
  expenseSummary.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
  expenseSummary.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  const splitHeaderRow = topOverBudget.length === 0 ? 5 : 4 + topOverBudget.length;
  expenseSummary.getRow(splitHeaderRow).font = { bold: true, color: { argb: "FFFFFFFF" } };
  expenseSummary.getRow(splitHeaderRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
  expenseSummary.getRow(splitHeaderRow + 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  expenseSummary.getRow(splitHeaderRow + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  autoWidthColumns(expenseSummary);

  if (data.annualBudgetRemaining.length > 0) {
    const annual = workbook.addWorksheet("Annual Budget Remaining");
    annual.addRow([
      "Category",
      "Annual Budget",
      "Spent YTD (Actual)",
      "Spent YTD (Recognized)",
      "Remaining (Actual)",
      "Remaining (Recognized)",
    ]);
    data.annualBudgetRemaining.forEach((r) => {
      annual.addRow([
        r.categoryName,
        r.annualBudget,
        r.spentActualYtd,
        r.spentRecognizedYtd,
        r.remainingActual,
        r.remainingRecognized,
      ]);
    });
    annual.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    annual.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
    for (let c = 2; c <= 6; c += 1) annual.getColumn(c).numFmt = currencyFmt;
    annual.views = [{ state: "frozen", ySplit: 1 }];
    autoWidthColumns(annual);
  }

  const insights = workbook.addWorksheet("Insights");
  insights.addRow(["Severity", "Title", "Detail", "Recommendation"]);
  data.insights.forEach((i) => {
    insights.addRow([i.severity, i.title, i.detail, i.recommendation || null]);
  });
  insights.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  insights.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  insights.columns = [
    { key: "severity", width: 12 },
    { key: "title", width: 34 },
    { key: "detail", width: 70 },
    { key: "recommendation", width: 70 },
  ] as any;
  insights.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${safeSlug(filenameBase)}.xlsx`,
  );
}

export function PulseExportActions({
  title,
  filenameBase,
  data,
  pdfHref,
}: {
  title: string;
  filenameBase: string;
  data: PulseExportData;
  pdfHref: string;
}) {
  const [busy, setBusy] = useState<null | "pdf" | "excel">(null);

  const onExportPdf = async () => {
    setBusy("pdf");
    window.location.assign(pdfHref);
    window.setTimeout(() => setBusy(null), 1200);
  };

  const onExportExcel = async () => {
    try {
      setBusy("excel");
      await exportPulseExcel(data, filenameBase);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-pulse-export-ignore="true" className="print:hidden flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Export
      </span>
      <button
        type="button"
        onClick={onExportPdf}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-200"
        aria-label={`Download ${title} PDF`}
      >
        {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Export PDF
      </button>
      <button
        type="button"
        onClick={onExportExcel}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-200"
        aria-label={`Download ${title} Excel`}
      >
        {busy === "excel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
        Export Excel
      </button>
      <span className="hidden rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 md:inline-block">
        Includes current filters ({data.meta.periodLabel})
      </span>
    </div>
  );
}
