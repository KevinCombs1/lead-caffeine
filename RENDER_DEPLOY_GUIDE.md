# Lead Caffeine — Render Deployment Guide

**GitHub repo:** https://github.com/KevinCombs1/lead-caffeine

## Quick Start (15 minutes)

The code is already pushed to GitHub. Follow these steps to deploy.

### 1. Create Blueprint on Render
1. Go to https://dashboard.render.com/blueprints
2. Click "New Blueprint"
3. Connect the GitHub repo: `KevinCombs1/lead-caffeine`
4. Render reads `render.yaml` and automatically creates 5 services:
   - **lead-caffeine** (web service — your app, port 5001)
   - **lead-caffeine-db** (PostgreSQL 18 + PostGIS 3.7)
   - **lead-caffeine-redis** (Redis 7 — MAID dedup + audience sets)
   - **lead-caffeine-clickhouse** (ClickHouse — capture analytics + bid wins)
   - **lead-caffeine-flaresolverr** (FlareSolverr — Cloudflare bypass for geocoding)

### 2. Set Secret Environment Variables
After Render creates the services, set these in the dashboard:

**lead-caffeine (web service):**
- `SCANNER_PASSWORD` = `LightEngine`
- `SERPER_API_KEY` = your Serper API key
- `CLICKHOUSE_PASSWORD` = must match what you set on the ClickHouse service

**lead-caffeine-db:**
- `POSTGRES_PASSWORD` = a strong password (save this — you'll need it for DATABASE_URL)

**lead-caffeine-clickhouse:**
- `CLICKHOUSE_PASSWORD` = a strong password (use the same value on the web service)

### 3. Update DATABASE_URL
After services are created, update the `DATABASE_URL` env var on the web service:
```
postgresql://leadcaffeine:<POSTGRES_PASSWORD>@lead-caffeine-db:5432/leadcaffeine
```
Replace `<POSTGRES_PASSWORD>` with the password you set on the DB service.

### 4. Initialize the Database
Open a shell on the lead-caffeine web service (Render dashboard → lead-caffeine → Shell) and run:
```bash
./scripts/init-production.sh
```
This does four things:
1. Enables the PostGIS extension on PostgreSQL
2. Creates Supreme tables (supreme_jobs, supreme_companies)
3. Creates Geofence tables (geofences with PostGIS geometry, captured_devices, audience_segments)
4. Creates ClickHouse tables (device_captures, bid_wins)

### 5. Point leadcaffeine.com to Render
In your DNS provider (Namecheap, Cloudflare, etc.):
- Add CNAME record: `leadcaffeine.com` → `lead-caffeine.onrender.com`
- Add CNAME record: `www.leadcaffeine.com` → `lead-caffeine.onrender.com`

DNS propagation takes 5-30 minutes.

### 6. Verify Deployment
- Visit `https://leadcaffeine.com/api/health` → should return `{"ok":true}`
- Visit `https://leadcaffeine.com` → should show the Lead Caffeine login page
- Log in with password `LightEngine`
- Go to **Geofence** tab → Dashboard should show 0 geofences (fresh database)
- Go to **Supreme** tab → start a Line 1 run to discover companies by keyword + location
- After companies are geocoded, go to **Geofence** → click "Generate Geofences" to create polygon geofences from coordinates
- Go to **DSP Sync** tab to export captured MAIDs or sync to Epom/SmartyAds

## Architecture

```
leadcaffeine.com (DNS)
    │
    ▼
Render Web Service (Node.js, port 5001)
    │
    ├── /api/openrtb/auction  ← SSPs send OpenRTB 2.5 bid requests here
    │                          Returns 204 (free harvest) or 200 ($0.50 bid for targeted MAIDs)
    ├── /api/ingest           ← Mobile apps ping directly with {lat, lng, maid} — no SSP needed
    ├── /api/geofence/*       ← Geofence management UI + API
    ├── /api/supreme/*        ← Company discovery (Line 1) + geocoding (Line 2)
    ├── /api/dsp/*            ← DSP audience sync (Epom CSV, SmartyAds JSON, manual CSV export)
    │
    ├── PostgreSQL 18 + PostGIS 3.7
    │     ├── geofences (GEOMETRY(Polygon, 4326) + GIST spatial index)
    │     ├── supreme_companies (discovered + geocoded businesses)
    │     ├── captured_devices (harvested MAIDs)
    │     ├── audience_segments (groups of geofences for DSP sync)
    │     └── dsp_sync_logs (sync history)
    │
    ├── Redis 7
    │     ├── maid:{id} (5-min TTL dedup keys)
    │     ├── audience:{geofenceId} (MAID sets per geofence)
    │     └── audience:target_maids (MAIDs that trigger $0.50 bids)
    │
    ├── ClickHouse
    │     ├── device_captures (every MAID harvest event, partitioned by month)
    │     └── bid_wins (auction win notifications for billing)
    │
    └── FlareSolverr (Cloudflare bypass for Supreme Line 2 geocoding)
```

## Costs (Render Starter plan)
- Web service: $7/mo
- PostgreSQL + PostGIS: $7/mo
- Redis: $7/mo
- ClickHouse: $7/mo
- FlareSolverr: $7/mo
- **Total: ~$35/mo**

## Next Steps After Deploy

### Get live bidstream traffic (Option A)
1. Register at a self-serve mobile exchange (MobFox, Smaato, DecenterAds, or Bidscube)
2. Submit your bidder endpoint: `https://leadcaffeine.com/api/openrtb/auction`
3. The exchange starts sending bid requests with device GPS coordinates
4. Devices inside your geofences get harvested (MAIDs captured to Redis + PostgreSQL + ClickHouse)
5. Add specific MAIDs to the target set to trigger $0.50 CPM bids:
   ```bash
   curl -X POST https://leadcaffeine.com/api/geofence/targeting/add \
     -H "Content-Type: application/json" \
     -d '{"maids": ["maid1", "maid2"]}'
   ```

### Sync audiences to DSPs (Option B)
1. Sign up at Epom (epom.com/dsp) or SmartyAds (smartyads.com/self-serve) — both self-serve, credit card, no minimum
2. Generate API credentials from account settings
3. Go to `https://leadcaffeine.com/geofence` → **DSP Sync** tab
4. Select Epom or SmartyAds, paste credentials, enter segment name, click Sync
5. Your captured MAIDs push to the DSP as a first-party audience segment
6. Create a campaign on the DSP targeting that audience — ads serve to devices captured from your geofences

### Alternative: Direct SDK ingestion (no exchange needed)
If you have mobile apps or partner web properties, have them ping:
```
POST https://leadcaffeine.com/api/ingest
Content-Type: application/json

{"lat": 41.68, "lng": -73.85, "maid": "device-id", "os": "iOS"}
```
This bypasses SSPs entirely — you harvest MAIDs directly from apps you control.

## Optional: Use Supabase instead of Docker PG
Render's managed PostgreSQL doesn't include PostGIS. This blueprint uses a
custom PostGIS Docker container. Alternatively:
1. Create a project at supabase.com (has PostGIS built in)
2. Set `DATABASE_URL` to the Supabase connection string on the web service
3. Remove the `lead-caffeine-db` service from `render.yaml`
4. Run in Supabase SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
5. Then run `migrations/0006_supreme.sql` and `migrations/0007_geofence_platform.sql`
   (copy-paste the contents into Supabase SQL editor)

## Troubleshooting

**Build fails on Render:** Check that `npm run build` succeeds locally. The Dockerfile runs `npm ci && npm run build`.

**Database errors:** Make sure `DATABASE_URL` is set correctly and the DB service is running. Run `./scripts/init-production.sh` from the web service shell.

**ClickHouse connection errors:** Verify `CLICKHOUSE_URL` and `CLICKHOUSE_PASSWORD` match between the web service and ClickHouse service.

**Geofences not generating:** You need geocoded companies in Supreme first. Run a Line 1 discovery job, then Line 2 geocoding, then generate geofences from the Geofence dashboard.

**OpenRTB endpoint not receiving traffic:** Make sure the exchange has your public URL (`https://leadcaffeine.com/api/openrtb/auction`), not localhost. Test it with:
```bash
curl -X POST https://leadcaffeine.com/api/openrtb/auction \
  -H "Content-Type: application/json" \
  -d '{"device":{"ifa":"test","geo":{"lat":41.68,"lon":-73.85}},"imp":[{"id":"1","banner":{"w":320,"h":50}}]}'
```
Should return HTTP 204 (or HTTP 200 if the MAID is in the target set).
