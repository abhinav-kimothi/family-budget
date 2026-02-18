# Deploy CuKiZa Family Cashflow to Railway

Follow these steps to get your app live on Railway with SQLite.

**Quick summary:** Push repo to GitHub → New Railway project from repo → Add Volume, mount at `/data` → Set `DATABASE_URL=file:/data/production.db` → Redeploy → Run `npx prisma migrate deploy` → Generate public domain → Optionally hit `/api/dev/seed` once to create users.

---

## 1. Push your code to GitHub

If you haven’t already:

```bash
cd "/Users/kim/Desktop/Github/Budget Tracking App/family-budget"
git init
git add .
git commit -m "Initial commit for Railway deploy"
```

Create a new repo on [github.com](https://github.com/new) (e.g. `cukiza-family-cashflow`), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Use your actual repo URL. Don’t push `.env` (it’s in `.gitignore`).

---

## 2. Create a Railway project

1. Go to **[railway.app](https://railway.app)** and sign in (e.g. **Login with GitHub**).
2. Click **New Project**.
3. Choose **Deploy from GitHub repo**.
4. Select your GitHub account and the repo you just pushed. Click **Deploy Now**.
5. Railway will add a service and start a first build (it may fail until we add the database and variables—that’s OK).

---

## 3. Add a volume for SQLite

We need a persistent disk so the SQLite file isn’t lost on redeploys.

1. In your project, click your **service** (the app, not the empty area).
2. Go to the **Variables** tab and note the **Reference** options; we’ll add variables in a moment.
3. Open the **Settings** tab (or use the **+ New** menu).
4. Click **Add Volume** (or **+ New** → **Volume**).
5. Name it e.g. `data`, size **1 GB**, same region as the service. Create it.
6. Attach the volume to your app service:
   - In the volume’s settings, set **Mount Path**: `/data`.
   - Or in the service’s **Settings** → **Volumes**, add this volume with mount path `/data`.

---

## 4. Set environment variables

1. Click your **app service** (the one that runs Next.js).
2. Open the **Variables** tab.
3. Click **+ New Variable** or **Add Variable**.
4. Add:

   - **Variable:** `DATABASE_URL`  
   - **Value:** `file:/data/production.db`

   (If your volume is mounted somewhere else, use that path, e.g. `file:/data/production.db`.)

5. Save. Railway will redeploy when variables change.

---

## 5. Set build and start commands

1. In the same service, go to **Settings**.
2. Under **Build**:
   - **Build Command:** `npx prisma generate && npm run build`
   - (Or leave empty to use the default; your `package.json` already has `"build": "prisma generate && next build"`.)
3. Under **Deploy**:
   - **Start Command:** `npm run start`
   - **Root Directory:** leave empty unless your app is in a subfolder (e.g. `family-budget`).

If your repo root is the Next.js app (e.g. you pushed the contents of `family-budget`), leave root directory empty. If you pushed the whole “Budget Tracking App” and the app is in `family-budget/`, set **Root Directory** to `family-budget`.

4. Trigger a redeploy (e.g. **Deployments** → **Redeploy** or push a new commit).

---

## 6. Run database migrations

After the first successful deploy:

1. Install Railway CLI (optional but easiest for running commands):
   ```bash
   npm i -g @railway/cli
   railway login
   ```
2. In your project folder (same as where you run `git`):
   ```bash
   cd "/Users/kim/Desktop/Github/Budget Tracking App/family-budget"
   railway link
   ```
   Select the project and the app service when asked.

3. Run migrations in the Railway environment:
   ```bash
   railway run npx prisma migrate deploy
   ```

If you don’t use the CLI, you can run the same command from the Railway dashboard: **Service** → **Settings** → **One-off command** (if available), or use **Shell** in the latest deployment and run:

```bash
npx prisma migrate deploy
```

---

## 7. Seed the database (first-time users)

Your app has a seed endpoint or script. To create an initial user and data:

1. **Option A – API (run once):**  
   After deploy, run in a terminal (seed is POST-only):  
   ```bash
   curl -X POST https://YOUR-APP.up.railway.app/api/dev/seed
   ```  
   Replace `YOUR-APP` with your Railway subdomain. This creates users `admin1`, `admin2`, `viewer1`, `viewer2` with password `familybudget`. Then consider restricting this route in production.

2. **Option B – CLI:**  
   If you have a seed script in `package.json` (e.g. `prisma db seed`), run it via Railway:
   ```bash
   railway run npx prisma db seed
   ```

After seeding, log in with the credentials from your seed (e.g. the ones mentioned on the login page).

---

## 8. Get your public URL

1. In the app service, go to **Settings** → **Networking** (or **Public Networking**).
2. Click **Generate Domain** (or **Add Domain**). Railway will give you a URL like:
   `https://your-app-name.up.railway.app`
3. Open that URL in a browser. You should see the login page.

---

## 9. Optional: custom domain

1. In **Settings** → **Networking**, add a **Custom Domain** (e.g. `cashflow.yourdomain.com`).
2. In your DNS provider, add a CNAME record pointing that hostname to the Railway URL (Railway will show the exact target).
3. Railway will issue HTTPS for the custom domain.

---

## Checklist

- [ ] Code pushed to GitHub (no `.env` committed).
- [ ] Railway project created from that repo.
- [ ] Volume added and mounted at `/data` (or your chosen path).
- [ ] `DATABASE_URL=file:/data/production.db` set in Variables.
- [ ] Build command runs `prisma generate` and `next build` (via your `package.json` or Railway build command).
- [ ] Start command is `npm run start`.
- [ ] `npx prisma migrate deploy` run once after first deploy.
- [ ] Seed run once (API or CLI) if you need initial users/data.
- [ ] Public domain generated and login page loads.

If a deploy fails, check **Deployments** → select the failed run → **View Logs**. Common issues: wrong **Root Directory**, missing `DATABASE_URL`, or volume not mounted at `/data`.
