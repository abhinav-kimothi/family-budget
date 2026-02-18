import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MonthYearNav } from "./MonthYearNav";
import { ClearMonthForm } from "./ClearMonthForm";
import { CollapsibleTableGroup } from "@/components/CollapsibleTableGroup";

async function saveEntries(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  for (const category of categories) {
    const actualRaw = String(
      formData.get(`amount-${category.id}`) || "",
    ).trim();
    const budgetRaw = String(
      formData.get(`budget-${category.id}`) || "",
    ).trim();

    // Actuals (MonthlyEntry)
    if (actualRaw) {
      const amount = Number(actualRaw);
      if (!Number.isNaN(amount)) {
        const existing = await prisma.monthlyEntry.findFirst({
          where: { year, month, categoryId: category.id },
        });

        if (existing) {
          await prisma.monthlyEntry.update({
            where: { id: existing.id },
            data: { amount },
          });
        } else {
          await prisma.monthlyEntry.create({
            data: {
              year,
              month,
              amount,
              categoryId: category.id,
            },
          });
        }
      }
    } else {
      // If cleared, remove any existing actual entry for this month/category
      await prisma.monthlyEntry.deleteMany({
        where: { year, month, categoryId: category.id },
      });
    }

    // Budgets (BudgetEntry)
    if (budgetRaw) {
      const amount = Number(budgetRaw);
      if (!Number.isNaN(amount)) {
        const existingBudget = await prisma.budgetEntry.findFirst({
          where: { year, month, categoryId: category.id },
        });

        if (existingBudget) {
          await prisma.budgetEntry.update({
            where: { id: existingBudget.id },
            data: { amount },
          });
        } else {
          await prisma.budgetEntry.create({
            data: {
              year,
              month,
              amount,
              categoryId: category.id,
            },
          });
        }
      }
    } else {
      // If cleared, remove any existing budget entry
      await prisma.budgetEntry.deleteMany({
        where: { year, month, categoryId: category.id },
      });
    }
  }

  redirect(`/entries?year=${year}&month=${month}`);
}

async function copyBudgetsFromPreviousMonth(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  // Previous month (handle January -> December of previous year)
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const previousBudgets = await prisma.budgetEntry.findMany({
    where: { year: prevYear, month: prevMonth },
  });

  for (const prev of previousBudgets) {
    const existing = await prisma.budgetEntry.findFirst({
      where: { year, month, categoryId: prev.categoryId },
    });

    if (existing) {
      await prisma.budgetEntry.update({
        where: { id: existing.id },
        data: { amount: prev.amount },
      });
    } else {
      await prisma.budgetEntry.create({
        data: {
          year,
          month,
          amount: prev.amount,
          categoryId: prev.categoryId,
        },
      });
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?year=${year}&month=${month}`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let cell = "";
      i += 1;
      while (i < line.length) {
        if (line[i] === '"') {
          i += 1;
          if (line[i] === '"') {
            cell += '"';
            i += 1;
          } else break;
        } else {
          cell += line[i];
          i += 1;
        }
      }
      out.push(cell);
      if (line[i] === ",") i += 1;
    } else {
      const j = line.indexOf(",", i);
      const cell =
        j === -1 ? line.slice(i) : line.slice(i, j);
      out.push(cell.trim());
      i = j === -1 ? line.length : j + 1;
    }
  }
  return out;
}

function normalizeType(type: string): string {
  const t = type.trim().toUpperCase();
  if (t === "INCOME" || t === "EXPENSE" || t === "INVESTMENT" || t === "OTHER")
    return t;
  if (t === "INVESTMENTS") return "INVESTMENT";
  return t;
}

async function uploadEntriesCsv(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const file = formData.get("csvFile") as File | null;

  if (!year || !month || !file?.size) {
    redirect(`/entries?year=${year}&month=${month}&upload=error`);
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    redirect(`/entries?year=${year}&month=${month}&upload=empty`);
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const categoryIdx = headers.findIndex(
    (h) => h === "category" || h === "category name",
  );
  const typeIdx = headers.findIndex((h) => h === "type");
  const planIdx = headers.findIndex((h) => h === "plan" || h === "planned");
  const actualIdx = headers.findIndex(
    (h) => h === "actual" || h === "actuals" || h === "actual amount",
  );

  if (categoryIdx === -1 || typeIdx === -1) {
    redirect(`/entries?year=${year}&month=${month}&upload=format`);
  }
  const hasPlan = planIdx >= 0;
  const hasActual = actualIdx >= 0;
  if (!hasPlan && !hasActual) {
    redirect(`/entries?year=${year}&month=${month}&upload=format`);
  }

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const categoryByKey = new Map<string, { id: number }>();
  for (const c of categories) {
    const key = `${c.name.trim().toLowerCase()}|${c.type}`;
    categoryByKey.set(key, { id: c.id });
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const catName = (cells[categoryIdx] ?? "").trim();
    const typeStr = normalizeType(cells[typeIdx] ?? "");
    if (!catName) continue;

    const key = `${catName.toLowerCase()}|${typeStr}`;
    const cat = categoryByKey.get(key);
    if (!cat) continue;

    if (hasPlan) {
      const planRaw = (cells[planIdx] ?? "").trim().replace(/,/g, "");
      if (planRaw !== "") {
        const amount = Number(planRaw);
        if (Number.isFinite(amount)) {
          const existing = await prisma.budgetEntry.findFirst({
            where: { year, month, categoryId: cat.id },
          });
          if (existing) {
            await prisma.budgetEntry.update({
              where: { id: existing.id },
              data: { amount },
            });
          } else {
            await prisma.budgetEntry.create({
              data: { year, month, categoryId: cat.id, amount },
            });
          }
        }
      }
    }

    if (hasActual) {
      const actualRaw = (cells[actualIdx] ?? "").trim().replace(/,/g, "");
      if (actualRaw !== "") {
        const amount = Number(actualRaw);
        if (Number.isFinite(amount)) {
          const existing = await prisma.monthlyEntry.findFirst({
            where: { year, month, categoryId: cat.id },
          });
          if (existing) {
            await prisma.monthlyEntry.update({
              where: { id: existing.id },
              data: { amount },
            });
          } else {
            await prisma.monthlyEntry.create({
              data: { year, month, categoryId: cat.id, amount },
            });
          }
        }
      } else {
        await prisma.monthlyEntry.deleteMany({
          where: { year, month, categoryId: cat.id },
        });
      }
    }
  }

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&upload=ok`);
}

async function clearMonthPlan(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  await prisma.budgetEntry.deleteMany({ where: { year, month } });

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&cleared=plan`);
}

async function clearMonthActuals(formData: FormData) {
  "use server";

  await requireAdmin();

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!year || !month) {
    redirect("/entries");
  }

  await prisma.monthlyEntry.deleteMany({ where: { year, month } });

  revalidatePath("/entries");
  revalidatePath("/dashboard");
  redirect(`/entries?year=${year}&month=${month}&cleared=actuals`);
}

function monthLabel(m: number) {
  return new Date(2000, m - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    upload?: string;
    cleared?: "plan" | "actuals" | string;
  }>;
}) {
  const user = await requireAdmin();

  const params = await searchParams;
  const uploadStatus = params.upload;
  const cleared = params.cleared;

  const now = new Date();
  const selectedYear = params.year
    ? Number(params.year)
    : now.getFullYear();
  const selectedMonth = params.month
    ? Number(params.month)
    : now.getMonth() + 1;

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const existingEntries = await prisma.monthlyEntry.findMany({
    where: { year: selectedYear, month: selectedMonth },
  });

  const existingBudgets = await prisma.budgetEntry.findMany({
    where: { year: selectedYear, month: selectedMonth },
  });

  const existingByCategory = new Map(
    existingEntries.map((e) => [e.categoryId, e]),
  );

  const budgetByCategory = new Map(
    existingBudgets.map((e) => [e.categoryId, e]),
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-slate-900 dark:text-slate-100">
            Monthly totals
          </h1>
          <p className="text-xs text-slate-800 dark:text-slate-300">
            One total per category for the selected month.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <MonthYearNav
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
        />
        <p className="text-[11px] text-slate-800 dark:text-slate-300">
          <span className="font-medium text-slate-700 dark:text-slate-200">{user.username}</span> · admin
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <form action={copyBudgetsFromPreviousMonth} className="inline">
            <input type="hidden" name="year" value={selectedYear} />
            <input type="hidden" name="month" value={selectedMonth} />
            <button
              type="submit"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Copy plans from previous month
            </button>
          </form>
          <ClearMonthForm
            year={selectedYear}
            month={selectedMonth}
            monthLabel={monthLabel(selectedMonth)}
            clearMonthPlan={clearMonthPlan}
            clearMonthActuals={clearMonthActuals}
          />
        </div>
      </div>

      {uploadStatus === "ok" && (
        <p className="rounded-lg border border-slate-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          CSV uploaded and data updated.
        </p>
      )}
      {uploadStatus === "error" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Upload failed. Please select a file and try again.
        </p>
      )}
      {uploadStatus === "empty" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          CSV file is empty or has no data rows.
        </p>
      )}
      {uploadStatus === "format" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          CSV must have headers: Category, Type, and Plan and/or Actual.
        </p>
      )}
      {cleared === "plan" && (
        <p className="rounded-lg border border-slate-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Plan for this month has been cleared.
        </p>
      )}
      {cleared === "actuals" && (
        <p className="rounded-lg border border-slate-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Actuals for this month have been cleared.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300">
            Download CSV
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/entries/export?year=${selectedYear}&month=${selectedMonth}&mode=both`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              download
            >
              Plan &amp; actuals
            </a>
            <a
              href={`/api/entries/export?year=${selectedYear}&month=${selectedMonth}&mode=plan`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              download
            >
              Plan only
            </a>
            <a
              href={`/api/entries/export?year=${selectedYear}&month=${selectedMonth}&mode=actual`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              download
            >
              Actuals only
            </a>
          </div>
        </div>
        <form
          action={uploadEntriesCsv}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="year" value={selectedYear} />
          <input type="hidden" name="month" value={selectedMonth} />
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300">
              Upload CSV
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                name="csvFile"
                accept=".csv,text/csv"
                required
                className="block text-xs text-slate-700 file:mr-2 file:rounded-lg file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-slate-700 dark:file:border-slate-600 dark:file:bg-slate-700 dark:file:text-slate-200 dark:text-slate-300"
              />
              <button
                type="submit"
                className="rounded-lg border border-[var(--brand-primary-hover)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                style={{ backgroundColor: "var(--brand-primary)" }}
              >
                Upload
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-300">
              Headers: Category, Type, Plan and/or Actual.
            </p>
          </div>
        </form>
      </div>

      <form
        action={saveEntries}
        className="space-y-4"
        key={`entries-form-${selectedYear}-${selectedMonth}`}
      >
        <input type="hidden" name="year" value={selectedYear} />
        <input type="hidden" name="month" value={selectedMonth} />
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Plan</th>
                <th className="px-4 py-2 text-right">Actual</th>
              </tr>
            </thead>
            <tbody>
              {(["INCOME", "EXPENSE", "INVESTMENT"] as const).map((type) => {
                const groupCategories = categories.filter(
                  (c) => c.type === type,
                );
                if (!groupCategories.length) return null;

                const groupLabel =
                  type === "INCOME"
                    ? "Income"
                    : type === "INVESTMENT"
                    ? "Investments"
                    : "Expenses";

                return (
                  <CollapsibleTableGroup
                    key={type}
                    title={groupLabel}
                    colSpan={3}
                  >
                    {groupCategories.map((category) => {
                      const existing = existingByCategory.get(category.id);
                      const existingBudget = budgetByCategory.get(category.id);
                      const defaultActual =
                        existing && existing.amount != null
                          ? Number(existing.amount).toString()
                          : "";
                      const defaultBudget =
                        existingBudget && existingBudget.amount != null
                          ? Number(existingBudget.amount).toString()
                          : "";

                      return (
                        <tr
                          key={category.id}
                          className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                        >
                          <td className="px-4 py-2">
                            <span className="text-sm dark:text-slate-200">{category.name}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              name={`budget-${category.id}`}
                              defaultValue={defaultBudget}
                              inputMode="decimal"
                              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-xs text-slate-900 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-cyan-500/50 dark:focus:ring-cyan-500/30"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              name={`amount-${category.id}`}
                              defaultValue={defaultActual}
                              inputMode="decimal"
                              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-xs text-slate-900 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-cyan-500/50 dark:focus:ring-cyan-500/30"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </CollapsibleTableGroup>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg border border-[var(--brand-primary-hover)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            Save and update dashboard
          </button>
        </div>
      </form>
    </div>
  );
}

