"use client";

export function DeleteCategoryButton({
  categoryId,
  categoryName,
  action,
}: {
  categoryId: number;
  categoryName: string;
  action: (formData: FormData) => Promise<void>;
}) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const msg = `Permanently delete "${categoryName}"? All plan and actual entries for this category will be removed. This cannot be undone.`;
    if (!window.confirm(msg)) return;
    const form = (e.target as HTMLButtonElement).closest("form");
    if (form) form.requestSubmit();
  }

  return (
    <form action={action}>
      <input type="hidden" name="id" value={categoryId} />
      <button
        type="button"
        onClick={handleClick}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-rose-700 transition hover:bg-rose-50 dark:border-slate-600 dark:bg-slate-700 dark:text-rose-300 dark:hover:bg-rose-900/30"
        title="Permanently delete category"
      >
        Delete
      </button>
    </form>
  );
}
