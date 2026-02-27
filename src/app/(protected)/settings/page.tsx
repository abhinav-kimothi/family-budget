import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

async function updateSettings(formData: FormData) {
  "use server";
  await requireAdmin();
  const initialBalance = formData.get("initialBalance");
  const openingInvestableBalance = formData.get("openingInvestableBalance");
  const currency = (formData.get("currency") as string) || "USD";
  const balance =
    initialBalance != null && initialBalance !== ""
      ? Number(String(initialBalance).replace(/,/g, ""))
      : 0;
  const investableBalance =
    openingInvestableBalance != null && openingInvestableBalance !== ""
      ? Number(String(openingInvestableBalance).replace(/,/g, ""))
      : 0;
  if (!Number.isFinite(balance) || !Number.isFinite(investableBalance)) {
    redirect("/settings?error=invalid");
  }
  const selectedTrackedCategoryIds = new Set(
    formData
      .getAll("annualBudgetRemainingCategoryIds")
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0),
  );
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { initialBalance: balance, openingInvestableBalance: investableBalance, currency },
    create: { id: 1, initialBalance: balance, openingInvestableBalance: investableBalance, currency },
  });
  const expenseCategories = await prisma.category.findMany({
    where: { type: "EXPENSE" },
    select: { id: true },
  });
  const rebalanceEligibleIds = new Set(
    formData
      .getAll("planRebalanceEligibleCategoryIds")
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0),
  );
  const rebalanceCategories = await prisma.category.findMany({
    where: { type: { in: ["EXPENSE", "INVESTMENT"] } },
    select: { id: true },
  });
  await prisma.$transaction(
    [
      ...expenseCategories.map((c) =>
        prisma.category.update({
          where: { id: c.id },
          data: { trackAnnualBudgetRemaining: selectedTrackedCategoryIds.has(c.id) },
        }),
      ),
      ...rebalanceCategories.map((c) => {
        const priorityRaw = String(formData.get(`planRebalancePriority-${c.id}`) || "").trim();
        const minRaw = String(formData.get(`planMinimumAmount-${c.id}`) || "").trim();
        const parsedPriority =
          priorityRaw === "" ? null : Number(priorityRaw);
        const parsedMin =
          minRaw === "" ? 0 : Number(minRaw.replace(/,/g, ""));
        return prisma.category.update({
          where: { id: c.id },
          data: {
            planRebalanceEligible: rebalanceEligibleIds.has(c.id),
            planRebalancePriority:
              parsedPriority != null && Number.isFinite(parsedPriority)
                ? Math.max(1, Math.trunc(parsedPriority))
                : null,
            planMinimumAmount:
              Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : 0,
          },
        });
      }),
    ],
  );
  revalidatePath("/dashboard");
  revalidatePath("/categories");
  revalidatePath("/settings");
  redirect("/settings?updated=1");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const settings = await prisma.settings.findFirst({ where: { id: 1 } });
  const expenseCategories = await prisma.category.findMany({
    where: { type: "EXPENSE", isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      trackAnnualBudgetRemaining: true,
    },
  });
  const rebalanceCategories = await prisma.category.findMany({
    where: { type: { in: ["EXPENSE", "INVESTMENT"] }, isActive: true },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      defaultNeedTier: true,
      planRebalanceEligible: true,
      planRebalancePriority: true,
      planMinimumAmount: true,
    },
  });
  const initialBalance =
    settings?.initialBalance != null ? Number(settings.initialBalance) : 0;
  const openingInvestable =
    settings?.openingInvestableBalance != null
      ? Number(settings.openingInvestableBalance)
      : 0;
  const currency = settings?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">
          Settings
        </h1>
        <p className="text-xs text-slate-800 dark:text-slate-300">
          Starting cash balance is used for running balance on the dashboard.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Category Management
            </p>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
              Manage categories, sort order, and default need tiers.
            </p>
          </div>
          <Link
            href="/categories"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-200"
          >
            Open Categories
          </Link>
        </div>
      </div>

      {params.updated === "1" && (
        <p className="rounded-lg border border-slate-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          Settings saved.
        </p>
      )}
      {params.error === "invalid" && (
        <p className="rounded-lg border border-slate-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Please enter a valid number for starting balance.
        </p>
      )}

      <form
        action={updateSettings}
        className="max-w-3xl space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800"
      >
        <div>
          <label
            htmlFor="initialBalance"
            className="block text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300"
          >
            Starting cash balance
          </label>
          <input
            id="initialBalance"
            name="initialBalance"
            type="text"
            inputMode="decimal"
            defaultValue={initialBalance}
            placeholder="0"
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-slate-500 dark:focus:ring-slate-500"
          />
          <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-300">
            Cash on hand at the start of the year. Running balance = this +
            net cashflow each month.
          </p>
        </div>
        <div>
          <label
            htmlFor="currency"
            className="block text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300"
          >
            Currency
          </label>
          <select
            id="currency"
            name="currency"
            defaultValue={currency}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="openingInvestableBalance"
            className="block text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300"
          >
            Opening investable balance
          </label>
          <input
            id="openingInvestableBalance"
            name="openingInvestableBalance"
            type="text"
            inputMode="decimal"
            defaultValue={openingInvestable}
            placeholder="0"
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-slate-500 dark:focus:ring-slate-500"
          />
          <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-300">
            Starting investable corpus separate from current-year cashflow. Excess investment over plan is assumed to come from this balance.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/40">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300">
            Annual Budget Remaining Categories
          </p>
          <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-300">
            Select expense categories to show in the dashboard section for calendar-year budget remaining.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {expenseCategories.length === 0 ? (
              <p className="text-xs text-slate-700 dark:text-slate-300">
                No active expense categories found.
              </p>
            ) : (
              expenseCategories.map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    name="annualBudgetRemainingCategoryIds"
                    value={category.id}
                    defaultChecked={category.trackAnnualBudgetRemaining}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span>{category.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/40">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300">
            Plan Rebalancing Rules (Entries → Plan Save)
          </p>
          <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-300">
            If planned cashflow goes negative, the app will auto-reduce eligible category budgets by priority (lower number first), without going below the minimum amount.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Eligible</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Type / Tier</th>
                  <th className="px-3 py-2 text-right">Priority</th>
                  <th className="px-3 py-2 text-right">Minimum plan</th>
                </tr>
              </thead>
              <tbody>
                {rebalanceCategories.length === 0 ? (
                  <tr className="border-t border-slate-100 dark:border-slate-600">
                    <td colSpan={5} className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      No active expense/investment categories found.
                    </td>
                  </tr>
                ) : (
                  rebalanceCategories.map((category) => (
                    <tr
                      key={`rebalance-rule-${category.id}`}
                      className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          name="planRebalanceEligibleCategoryIds"
                          value={category.id}
                          defaultChecked={category.planRebalanceEligible}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                        />
                      </td>
                      <td className="px-3 py-2">{category.name}</td>
                      <td className="px-3 py-2 text-[11px]">
                        {category.type === "EXPENSE"
                          ? `Expense${category.defaultNeedTier ? ` · ${category.defaultNeedTier.replace("_", " ").toLowerCase()}` : ""}`
                          : "Investment"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          name={`planRebalancePriority-${category.id}`}
                          type="number"
                          min="1"
                          step="1"
                          defaultValue={category.planRebalancePriority ?? ""}
                          placeholder="auto"
                          className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          name={`planMinimumAmount-${category.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={Number(category.planMinimumAmount ?? 0)}
                          className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-700 dark:text-slate-300">
            Suggested setup: mark optional investment categories (e.g. Crypto) as highest priority, then non-essential expense categories.
          </p>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-[var(--brand-primary-hover)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          Save settings
        </button>
      </form>
    </div>
  );
}
