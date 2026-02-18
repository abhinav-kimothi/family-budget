import Link from "next/link";
import { redirect } from "next/navigation";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CuKiZaLogo } from "@/components/CuKiZaLogo";

async function logout() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header
        className="sticky top-0 z-10 border-b-2 border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
        style={{ borderBottomColor: "var(--brand-primary)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <CuKiZaLogo />
            <nav className="flex items-center gap-1 text-xs text-slate-800 dark:text-slate-200">
              <Link
                href="/dashboard"
                className="rounded-lg border-b-2 border-transparent px-3 py-2 font-medium text-slate-700 transition hover:border-[#47c7fc] hover:bg-[#47c7fc]/10 hover:text-[#0369a1] dark:text-slate-300 dark:hover:border-[#47c7fc] dark:hover:bg-[#47c7fc]/15 dark:hover:text-[#67e8f9]"
              >
                Dashboard
              </Link>
              {isAdmin && (
                <Link
                  href="/entries"
                  className="rounded-lg border-b-2 border-transparent px-3 py-2 font-medium text-slate-700 transition hover:border-[#47c7fc] hover:bg-[#47c7fc]/10 hover:text-[#0369a1] dark:text-slate-300 dark:hover:border-[#47c7fc] dark:hover:bg-[#47c7fc]/15 dark:hover:text-[#67e8f9]"
                >
                  Entries
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/categories"
                  className="rounded-lg border-b-2 border-transparent px-3 py-2 font-medium text-slate-700 transition hover:border-[#47c7fc] hover:bg-[#47c7fc]/10 hover:text-[#0369a1] dark:text-slate-300 dark:hover:border-[#47c7fc] dark:hover:bg-[#47c7fc]/15 dark:hover:text-[#67e8f9]"
                >
                  Categories
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/settings"
                  className="rounded-lg border-b-2 border-transparent px-3 py-2 font-medium text-slate-700 transition hover:border-[#47c7fc] hover:bg-[#47c7fc]/10 hover:text-[#0369a1] dark:text-slate-300 dark:hover:border-[#47c7fc] dark:hover:bg-[#47c7fc]/15 dark:hover:text-[#67e8f9]"
                >
                  Settings
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <ThemeToggle />
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-600 dark:bg-slate-700">
              <span className="font-medium text-slate-800 dark:text-slate-200">{user.username}</span>
              <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                {user.role.toLowerCase()}
              </span>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

