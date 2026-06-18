# Deploy to Render — Zero Code Changes Guide

> **Do not change any code.** This app is 100% ready for Render as-is.

---

## Step 1: Push Code to GitHub

1. Go to your Replit project sidebar → Git
2. Stage all changes → Commit with message "Ready for Render"
3. Click "Push to GitHub" (create a new repo if you haven't already)

---

## Step 2: Create a PostgreSQL Database on Render

1. Go to [render.com](https://render.com) and sign in
2. Click **New** → **PostgreSQL**
3. Name it: `data-cloudware-db`
4. Region: pick the closest one to you
5. Plan: **Free** (1 GB storage, 1 shared CPU — plenty for this app)
6. Click **Create Database**
7. Wait ~1 minute, then copy the **Internal Database URL** (starts with `postgres://...`)

---

## Step 3: Create a Web Service on Render

1. Click **New** → **Web Service**
2. Connect your GitHub repo
3. Configure:
   - **Name**: `data-cloudware`
   - **Region**: same as your DB
   - **Branch**: `main` (or whatever you pushed)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start` (or `node server/index.js` if that's your entry)
   - **Plan**: **Free**

---

## Step 4: Add Environment Variables

In your Render Web Service dashboard → **Environment** tab, add these:

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `DATABASE_URL` | `postgres://...` | From your Render PostgreSQL dashboard (Internal Database URL) |
| `SCANNER_PASSWORD` | `LightEngine` | Your current app password (or whatever you want) |
| `NODE_ENV` | `production` | Just type this |

> **No other env vars are required.** The email engine uses DB-stored credentials, not env vars.

---

## Step 5: Deploy

1. Click **Manual Deploy** → **Deploy Latest Commit**
2. Render builds the app (npm install + build) and starts the server
3. Wait ~2–3 minutes
4. Click the **URL** at the top of the dashboard (e.g., `https://data-cloudware.onrender.com`)

---

## What Render Does Automatically

- Builds the Vite frontend into `dist/`
- Starts the Express backend on the assigned port
- Proxies all `/api/*` requests to the backend
- Serves static files from `dist/`
- Restarts on crashes automatically

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot connect to database" | Double-check `DATABASE_URL` is the **Internal** URL, not external |
| "Build failed" | Check the Render build logs; make sure `npm run build` works locally first |
| "App starts then dies" | Check the Render logs tab for the exact error |
| "Slow first load" | Normal on Render Free — the container spins down after 15 min idle, then wakes up on next request (~30s cold start) |

---

## Important Notes

- **Do not change any code.** The app uses standard Express + Vite patterns that Render expects.
- **Do not add a `render.yaml`** or any Render-specific config files. Not needed.
- **The database persists.** Your campaigns, templates, providers, and recipients survive restarts.
- **Free tier limitations:** Container sleeps after 15 min idle. Upgrade to Starter ($7/mo) for always-on.

---

## Done

Your app is live at `https://data-cloudware.onrender.com`. Log in with the same password you set in `SCANNER_PASSWORD`.
