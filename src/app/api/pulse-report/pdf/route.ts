import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

function chromeExecutablePath() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];
  return candidates[0]!;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const year = url.searchParams.get("year");
  const view = url.searchParams.get("view") || "month";
  const month = url.searchParams.get("month");
  const monthFrom = url.searchParams.get("monthFrom");
  const monthTo = url.searchParams.get("monthTo");
  const hideEmpty = url.searchParams.get("hideEmpty");

  const reportParams = new URLSearchParams();
  if (year) reportParams.set("year", year);
  if (view) reportParams.set("view", view);
  if (month) reportParams.set("month", month);
  if (monthFrom) reportParams.set("monthFrom", monthFrom);
  if (monthTo) reportParams.set("monthTo", monthTo);
  if (hideEmpty === "1") reportParams.set("hideEmpty", "1");
  reportParams.set("report", "1");

  const reportUrl = `${url.origin}/dashboard?${reportParams.toString()}`;
  const fileSuffix =
    view === "month" && month
      ? `${year ?? "report"}-${String(month).padStart(2, "0")}`
      : view === "range" && monthFrom && monthTo
        ? `${year ?? "report"}-${String(monthFrom).padStart(2, "0")}-to-${String(monthTo).padStart(2, "0")}`
        : `${year ?? "report"}-${view}`;
  const filename = `pulse-${fileSuffix}.pdf`;

  let browser: any;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({
      executablePath: chromeExecutablePath(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    }
    await page.goto(reportUrl, { waitUntil: "networkidle", timeout: 45000 });
    await page.emulateMedia({ media: "print" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      preferCSSPageSize: true,
    });
    await context.close();
    await browser.close();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
    const message =
      error instanceof Error ? error.message : "Failed to generate PDF";
    return new NextResponse(message, { status: 500 });
  }
}

