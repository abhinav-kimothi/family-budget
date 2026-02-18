# CuKiZa Family Cashflow

A simple budget tracker for your household: income, expenses, investments, budget vs actual, and shared access for family (admin and viewer roles).

## Getting started (development)

```bash
npm install
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Seed default users and categories once:

```bash
curl -X POST http://localhost:3000/api/dev/seed
```

Then log in as `admin1` / `familybudget` (or `viewer1` for view-only).

## Hosting so family can access it (same Wi‑Fi / home network)

Run the app on one computer (e.g. your laptop or a small home server) and have family open it in their browsers on the same network.

### 1. Build and run for your network

On the machine that will host the app:

```bash
cd family-budget
npm run build
npm run start:lan
```

`start:lan` runs the app so it listens on all interfaces (`0.0.0.0`), not only localhost. The terminal will show something like:

- **Local:** http://localhost:3000  
- **Network:** http://192.168.x.x:3000  

### 2. Find your host machine’s IP

- **macOS / Linux:** run `ifconfig` or `ip addr` and look for your Wi‑Fi address (e.g. `192.168.1.5` or `192.168.68.110`).  
- Or use the **Network** URL printed by `npm run start:lan` (e.g. `http://192.168.68.110:3000`).

### 3. Share the link with family

Give everyone the **Network** URL, for example:

- **http://192.168.68.110:3000**

Anyone on the same Wi‑Fi can open that in a browser and log in with the same accounts (admin1, admin2, viewer1, viewer2 / `familybudget`).

### 4. Keep it running

- Leave the terminal (and computer) running while you want the app available.  
- The SQLite database is in the project folder (`dev.db` or the path in `.env`), so avoid moving or deleting it.  
- To stop: press `Ctrl+C` in that terminal.

### Optional: run in the background

- **macOS / Linux:** `npm run start:lan &` or use `nohup npm run start:lan &` so it keeps running after you close the terminal.  
- For a more permanent setup, run it as a system service (e.g. systemd on Linux) or in a terminal multiplexer (e.g. `tmux`).

### Security note

This setup is for a **trusted home network**. The app is HTTP only (no HTTPS). Do not expose the app to the internet (no port forwarding on your router) unless you add HTTPS and proper security.

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Deploy on Vercel](https://vercel.com/new) – for putting the app on the internet (requires DB hosting, e.g. Vercel Postgres or external DB).
