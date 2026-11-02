# Lead Caffeine — Render Deployment Guide

## Quick Start (15 minutes)

### 1. Push to GitHub
```bash
git add -A
git commit -m "Add Render deployment: Dockerfile, render.yaml, init script"
git push origin main
```

### 2. Create Blueprint on Render
1. Go to https://dashboard.render.com/blueprints
2. Click "New Blueprint"
3. Connect your GitHub repo
4. Render reads `render.yaml` and creates 5 services:
   - **lead-caffeine** (web service — your app)
   - **lead-caffeine-db** (PostgreSQL 18 + PostGIS 3.7)
   - **lead-caffeine-redis** (Redis 7)
   - **lead-caffeine-clickhouse** (ClickHouse)
   - **lead-caffeine-flaresolverr** (FlareSolverr)

### 3. Set Secret Environment Variables
In Render dashboard, set these on each service:

**lead-caffeine (web service):**
- `SCANNER_PASSWORD` = `LightEngine`
- `SERPER_API_KEY` = your Serper API key
- `CLICKHOUSE_PASSWORD` = (same as lead-caffeine-clickhouse)

**lead-caffeine-db:**
- `POSTGRES_PASSWORD` = a strong password

**lead-caffeine-clickhouse:**
- `CLICKHOUSE_PASSWORD` = a strong password (use same value on web service)

### 4. Update DATABASE_URL
After services are created, get the internal hostname for the DB service and update the `DATABASE_URL` env var on the web service:
```
postgresql://leadcaffeine:<POSTGRES_PASSWORD>@lead-caffeine-db:5432/leadcaffeine
```

### 5. Initialize the Database
Open a shell on the lead-caffeine web service and run:
```bash
./scripts/init-production.sh
```
This enables PostGIS, runs migrations, and creates ClickHouse tables.

### 6. Point leadcaffeine.com to Render
In your DNS provider:
- Add CNAME: `leadcaffeine.com` → `lead-caffeine.onrender.com`
- Add CNAME: `www.leadcaffeine.com` → `lead-caffeine.onrender.com`

### 7. Verify
- Visit `https://leadcaffeine.com/api/health` → should return `{"ok":true}`
- Visit `https://leadcaffeine.com` → should show login page
- Log in with password `LightEngine`
- Go to Geofence tab → should show 0 geofences (fresh database)
- Go to Supreme tab → start a Line 1 run to discover companies
- After geocoding, go to Geofence → Generate geofences from Supreme data

## Architecture
```
leadcaffeine.com (DNS)
    │
    ▼
Render Web Service (Node.js, port 5001)
    ├── /api/openrtb/auction  ← SSPs send bid requests here
    ├── /api/ingest           ← Mobile apps ping directly here
    ├── /api/geofence/*       ← Geofence management UI
    ├── /api/supreme/*        ← Company discovery + geocoding
    ├── /api/dsp/*            ← DSP audience sync (Epom/SmartyAds)
    │
    ├── PostgreSQL 18 + PostGIS 3.7 (geofences, companies, devices)
    ├── Redis 7 (MAID dedup, audience sets, target_maids)
    ├── ClickHouse (capture analytics, bid win logging)
    └── FlareSolverr (Cloudflare bypass for geocoding)
```

## Costs (Render Starter plan)
- Web service: $7/mo
- PostgreSQL: $7/mo
- Redis: $7/mo
- ClickHouse: $7/mo
- FlareSolverr: $7/mo
- **Total: ~$35/mo**

## Optional: Use Supabase instead of Docker PG
Render's managed PostgreSQL doesn't include PostGIS. This blueprint uses a
custom PostGIS Docker container. Alternatively:
1. Create a project at supabase.com (has PostGIS built in)
2. Set DATABASE_URL to the Supabase connection string
3. Remove the lead-caffeine-db service from render.yaml
4. Run `CREATE EXTENSION IF NOT EXISTS postgis;` in Supabase SQL editor
5. Run migrations 0006 and 0007 in Supabase SQL editor
