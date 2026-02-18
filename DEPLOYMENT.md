# Hosting CuKiZa Family Cashflow on the Internet

Your app is **Next.js 16** with **Prisma** and **SQLite**. Below are practical ways to host it. You’ll need to set **environment variables** on the host (never commit `.env` with real secrets).

---

## Before you deploy

1. **Environment variables**  
   The app needs at least:
   - `DATABASE_URL` – database connection string (format depends on host; see options below).

2. **Build**  
   The host must run Prisma generate before building. Use the updated build script in `package.json` (see end of this file) or run:
   - `npx prisma generate`
   - `npm run build`

3. **Database setup**  
   On first deploy, run migrations (and optionally seed) once:
   - `npx prisma migrate deploy`
   - Optional: call your seed API if you have one (e.g. `/api/dev/seed`).

4. **Git**  
   Push your code to GitHub (or GitLab). Most hosts deploy from a repo. Ensure `.env` is in `.gitignore` and not committed.

---

## Option 1: Railway (recommended for SQLite or Postgres)

**Why:** Simple, supports Next.js, persistent storage for SQLite, or managed Postgres.

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. **New Project** → **Deploy from GitHub repo** → select your repo and branch.
3. **Add database (optional):**
   - **SQLite:** Add a **Volume**, mount it (e.g. `/data`), and set:
     - `DATABASE_URL=file:/data/production.db`
   - **Postgres:** Click **Add PostgreSQL**. Railway sets `DATABASE_URL` for you. You’ll need to [switch Prisma to Postgres](https://www.prisma.io/docs/orm/more/migrating-to-prisma/migrate-from-sqlite-to-postgresql) and run migrations.
4. In your **Service** (the Next.js app):
   - **Settings** → **Build:** Build command: `npx prisma generate && npm run build`
   - **Settings** → **Deploy:** Start command: `npm run start`
   - **Variables:** Add `DATABASE_URL` (and any others) if not set by Railway.
5. Deploy. After first deploy, run migrations in the **Shell** (or via CLI):
   - `npx prisma migrate deploy`
6. Your app URL will be like `https://your-app.up.railway.app`.

---

## Option 2: Vercel (use Postgres or Turso, not file SQLite)

**Why:** Best integration with Next.js, but serverless = no writable local filesystem, so **file-based SQLite won’t work**.

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo.
2. **Database:** Use one of:
   - **Vercel Postgres** (in dashboard: Storage → Create Database → Postgres). Then [migrate Prisma from SQLite to Postgres](https://www.prisma.io/docs/orm/more/migrating-to-prisma/migrate-from-sqlite-to-postgresql), and set `DATABASE_URL` in Vercel from the Postgres tab.
   - **Turso** (SQLite-compatible, [turso.tech](https://turso.tech)): create a DB, get the URL and auth token, set `DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel; use the Turso Prisma driver/adapter.
3. **Build:** In Project Settings → Build & Development, set:
   - Build command: `npx prisma generate && npm run build`
4. **Environment variables:** Add `DATABASE_URL` (and Turso token if used) in Vercel.
5. Deploy. Run migrations once (Vercel dashboard → your project → Settings → or use Vercel CLI):  
   `npx prisma migrate deploy`

---

## Option 3: Render

**Why:** Free tier available, supports long-running services and optional persistent disk.

1. Go to [render.com](https://render.com) and connect your GitHub repo.
2. **New** → **Web Service** → select repo.
   - **Environment:** Node.
   - **Build command:** `npx prisma generate && npm run build`
   - **Start command:** `npm run start`
3. **Database:**  
   - **SQLite:** Add a **Disk** (e.g. mount path `/data`) and set:
     - `DATABASE_URL=file:/data/production.db`
   - **Postgres:** Add a **PostgreSQL** instance and use its `DATABASE_URL`; migrate Prisma to Postgres and run migrations.
4. Add `DATABASE_URL` (and any other env vars) under **Environment**.
5. After first deploy, open **Shell** and run:
   - `npx prisma migrate deploy`

---

## Option 4: Fly.io

**Why:** Good for a single VM with a persistent volume (SQLite) or a small Postgres instance.

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/) and sign in: `fly auth login`.
2. From your project root: `fly launch` (follow prompts; choose a region).
3. Add a volume for SQLite:  
   `fly volumes create data --size 1 --region <your-region>`  
   Then in `fly.toml` (created by `fly launch`), add under `[mounts]`:
   - `source = "data"`
   - `destination = "/data"`
4. Set env:  
   `fly secrets set DATABASE_URL=file:/data/production.db`
5. In your Dockerfile or build, run `prisma generate` and `prisma migrate deploy` (or run migrate once via `fly ssh console`).
6. Deploy: `fly deploy`.

(If you use Fly Postgres instead, use its `DATABASE_URL` and migrate Prisma to Postgres.)

---

## Option 5: Your own server (VPS)

**Why:** Full control; SQLite or any DB you install.

1. Rent a small VPS (e.g. DigitalOcean, Linode, Hetzner).
2. Install Node (LTS), clone your repo, then:
   - `npm ci`
   - Set `DATABASE_URL` (e.g. `file:./production.db` or a path under `/var`).
   - `npx prisma generate && npx prisma migrate deploy`
   - `npm run build && npm run start`
3. Put the app behind a reverse proxy (Nginx/Caddy) with HTTPS (e.g. Let’s Encrypt).
4. Use a process manager (systemd, PM2) so the app restarts on reboot.

---

## Quick comparison

| Host     | SQLite file | Postgres        | Ease        | Free tier   |
|----------|-------------|-----------------|-------------|-------------|
| Railway  | Yes (volume)| Yes             | Easy        | Limited     |
| Vercel   | No          | Yes / Turso     | Easy        | Yes         |
| Render   | Yes (disk)  | Yes             | Easy        | Yes (limits)|
| Fly.io   | Yes (volume)| Yes             | Medium      | Yes (limits)|
| VPS      | Yes         | Yes (you install)| More work | No          |

---

## Suggested `package.json` build script

Ensure Prisma client is generated before `next build`. In `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "prisma generate && next build",
  "start": "next start",
  "start:lan": "next start --hostname 0.0.0.0",
  "lint": "eslint",
  "postinstall": "prisma generate"
}
```

- **`build`:** `prisma generate && next build` so every deploy has the client.
- **`postinstall`:** `prisma generate` so installs on the host also generate the client (optional but useful).

---

## After going live

- Use **HTTPS** (all the hosts above provide it).
- Restrict your seed/dev routes (e.g. `/api/dev/seed`) so they’re not public in production (e.g. env check, or remove from production build).
- Back up the database regularly (e.g. copy `production.db` for SQLite, or use your provider’s Postgres backups).

If you tell me which option you prefer (e.g. Railway vs Vercel), I can give step-by-step commands tailored to your repo and Prisma setup.
