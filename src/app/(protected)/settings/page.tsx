import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

async function updateSettings(formData: FormData) {
  "use server";
  await requireAdmin();
  const initialBalance = formData.get("initialBalance");
  const currency = (formData.get("currency") as string) || "USD";
  const balance =
    initialBalance != null && initialBalance !== ""
      ? Number(String(initialBalance).replace(/,/g, ""))
      : 0;
  if (!Number.isFinite(balance)) {
    redirect("/settings?error=invalid");
  }
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { initialBalance: balance, currency },
    create: { id: 1, initialBalance: balance, currency },
  });
  revalidatePath("/dashboard");
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
  const initialBalance =
    settings?.initialBalance != null ? Number(settings.initialBalance) : 0;
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
        className="max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800"
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
