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
        className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-700/80 dark:bg-slate-900/85"
      >
        <div
          className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-sky-400 to-orange-400"
          aria-hidden
        />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3 md:gap-6">
            <Link
              href="/dashboard"
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-sky-700"
              aria-label="Go to Pulse"
            >
              <CuKiZaLogo />
            </Link>
            <nav className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-200"
              >
                Pulse
              </Link>
              {isAdmin && (
                <Link
                  href="/entries"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-200"
                >
                  Entries
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/settings"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-200"
                >
                  Settings
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <ThemeToggle />
            </div>
            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-2 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800 dark:text-slate-200">{user.username}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {user.role.toLowerCase()}
                </span>
              </div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm transition hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-rose-900/20 dark:hover:text-rose-200"
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
