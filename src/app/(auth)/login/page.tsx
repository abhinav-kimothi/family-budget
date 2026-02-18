import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { getCurrentUser, createSessionForUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CuKiZaLogo } from "@/components/CuKiZaLogo";

async function login(formData: FormData) {
  "use server";

  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    redirect("/login?error=Missing%20username%20or%20password");
  }

  const dbUrl = process.env.DATABASE_URL;
  const resolvedPath = dbUrl?.startsWith("file:")
    ? dbUrl.replace("file:", "")
    : dbUrl;

  console.log("[login] process.cwd() =", process.cwd());
  console.log("[login] DATABASE_URL =", dbUrl);
  if (resolvedPath) {
    console.log(
      "[login] resolvedPath exists =",
      fs.existsSync(
        path.isAbsolute(resolvedPath)
          ? resolvedPath
          : path.join(process.cwd(), resolvedPath),
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    redirect("/login?error=Invalid%20credentials");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    redirect("/login?error=Invalid%20credentials");
  }

  await createSessionForUser(user.id);
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const { error: rawError } = await searchParams;

  const error = rawError
    ? decodeURIComponent(rawError)
    : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4 dark:bg-slate-900">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-600 dark:bg-slate-800"
        style={{ borderTopWidth: 4, borderTopColor: "#ff8000" }}
      >
        <div className="mb-1 flex justify-center">
          <CuKiZaLogo variant="full" className="text-lg" />
        </div>
        <p className="mb-6 text-center text-xs text-slate-800 dark:text-slate-300">
          Sign in with a shared family account
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-[#ff5252] bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        <form action={login} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              required
              autoComplete="username"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#47c7fc] focus:outline-none focus:ring-2 focus:ring-[#47c7fc]/30 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#47c7fc] focus:outline-none focus:ring-2 focus:ring-[#47c7fc]/30 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>

          <button
            type="submit"
            className="mt-2 flex w-full items-center justify-center rounded-lg border border-[#e67300] px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "#ff8000" }}
          >
            Sign in
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-700 dark:text-slate-300">
          After seeding: admin1, admin2, viewer1, viewer2
        </p>
      </div>
    </div>
  );
}
