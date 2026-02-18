import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { DeleteCategoryButton } from "./DeleteCategoryButton";
import { CollapsibleTableGroup } from "@/components/CollapsibleTableGroup";

async function createCategory(formData: FormData) {
  "use server";

  await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "EXPENSE");

  if (!name) {
    return;
  }

  const existingMax = await prisma.category.aggregate({
    _max: { sortOrder: true },
  });

  const nextSort =
    typeof existingMax._max.sortOrder === "number"
      ? existingMax._max.sortOrder + 1
      : 1;

  await prisma.category.create({
    data: {
      name,
      type: type as "INCOME" | "EXPENSE" | "INVESTMENT" | "OTHER",
      sortOrder: nextSort,
    },
  });

  revalidatePath("/categories");
}

async function toggleCategory(formData: FormData) {
  "use server";

  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!id) return;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return;

  await prisma.category.update({
    where: { id },
    data: { isActive: !category.isActive },
  });

  revalidatePath("/categories");
}

async function moveCategoryUp(formData: FormData) {
  "use server";

  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!id) return;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.sortOrder == null) return;

  const above = await prisma.category.findFirst({
    where: {
      type: category.type,
      sortOrder: { lt: category.sortOrder },
    },
    orderBy: { sortOrder: "desc" },
  });

  if (!above || above.sortOrder == null) return;

  await prisma.$transaction([
    prisma.category.update({
      where: { id: category.id },
      data: { sortOrder: above.sortOrder },
    }),
    prisma.category.update({
      where: { id: above.id },
      data: { sortOrder: category.sortOrder },
    }),
  ]);

  revalidatePath("/categories");
}

async function moveCategoryDown(formData: FormData) {
  "use server";

  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!id) return;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.sortOrder == null) return;

  const below = await prisma.category.findFirst({
    where: {
      type: category.type,
      sortOrder: { gt: category.sortOrder },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (!below || below.sortOrder == null) return;

  await prisma.$transaction([
    prisma.category.update({
      where: { id: category.id },
      data: { sortOrder: below.sortOrder },
    }),
    prisma.category.update({
      where: { id: below.id },
      data: { sortOrder: category.sortOrder },
    }),
  ]);

  revalidatePath("/categories");
}

async function deleteCategory(formData: FormData) {
  "use server";

  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!id) return;

  await prisma.category.delete({
    where: { id },
  });

  revalidatePath("/categories");
  revalidatePath("/entries");
  revalidatePath("/dashboard");
}

const TYPE_ORDER: ("INCOME" | "EXPENSE" | "INVESTMENT" | "OTHER")[] = [
  "INCOME",
  "EXPENSE",
  "INVESTMENT",
  "OTHER",
];

function typeLabel(type: string) {
  switch (type) {
    case "INCOME":
      return "Income";
    case "INVESTMENT":
      return "Investment";
    case "OTHER":
      return "Other";
    default:
      return "Expense";
  }
}

export default async function CategoriesPage() {
  await requireAdmin();

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">
          Categories
        </h1>
        <p className="text-xs text-slate-800 dark:text-slate-300">
          Income, expense, and investment categories for monthly totals.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300">
          Add category
        </h2>
        <form action={createCategory} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px] flex-1">
            <label
              htmlFor="name"
              className="block text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500"
            />
          </div>
          <div>
            <label
              htmlFor="type"
              className="block text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:text-slate-300"
            >
              Type
            </label>
            <select
              id="type"
              name="type"
              className="mt-1.5 w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-500"
              defaultValue="EXPENSE"
            >
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
              <option value="INVESTMENT">Investment</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            Add
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-300">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.map((type) => {
              const groupCategories = categories.filter((c) => c.type === type);
              if (!groupCategories.length) return null;

              const groupLabel = typeLabel(type);

              return (
                <CollapsibleTableGroup
                  key={type}
                  title={groupLabel}
                  colSpan={3}
                >
                  {groupCategories.map((category) => (
                    <tr
                      key={category.id}
                      className="border-t border-slate-100 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                    >
                      <td className="px-4 py-2 text-sm dark:text-slate-200">
                        {category.name}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {category.isActive ? (
                          <span className="rounded-full border border-slate-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:border-slate-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-800 dark:border-slate-600 dark:bg-slate-600 dark:text-slate-300">
                            Hidden
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <form action={moveCategoryUp}>
                            <input type="hidden" name="id" value={category.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                              title="Move up"
                            >
                              ↑
                            </button>
                          </form>
                          <form action={moveCategoryDown}>
                            <input type="hidden" name="id" value={category.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                              title="Move down"
                            >
                              ↓
                            </button>
                          </form>
                          <form action={toggleCategory}>
                            <input type="hidden" name="id" value={category.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                            >
                              {category.isActive ? "Hide" : "Activate"}
                            </button>
                          </form>
                          <DeleteCategoryButton
                            categoryId={category.id}
                            categoryName={category.name}
                            action={deleteCategory}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </CollapsibleTableGroup>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

