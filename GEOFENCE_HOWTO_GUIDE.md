# Lead Caffeine — Geofence Platform How-To Guide

The Geofence tab is the operational hub for your hyperlocal advertising engine. It connects four pipeline layers — PostGIS geofences, OpenRTB bidstream processing, Redis/ClickHouse analytics, and DSP audience sync — into one dashboard.

This guide covers every tab, every action, and every endpoint in detail.

---

## Table of Contents

1. [Dashboard Tab — Overview & Quick Start](#1-dashboard-tab)
2. [Geofences Tab — Managing Geofences](#2-geofences-tab)
3. [Captured Devices Tab — Device Intelligence](#3-captured-devices-tab)
4. [Audience Segments Tab — Building Audiences](#4-audience-segments-tab)
5. [Bidstream Test Tab — Simulating Bid Requests](#5-bidstream-test-tab)
6. [DSP Sync Tab — Pushing Audiences to Ad Platforms](#6-dsp-sync-tab)
7. [API Reference — All Endpoints](#7-api-reference)
8. [Architecture — How It All Works](#8-architecture)
9. [Common Workflows — Step by Step](#9-common-workflows)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Dashboard Tab

The Dashboard is your at-a-glance overview of the entire pipeline. It has five sections.

### Stat Cards (Top Row)

Five cards show live metrics, refreshing every 5 seconds:

| Card | What It Shows | Color |
|------|--------------|-------|
| **Total Geofences** | All geofences in the database | Blue |
| **Active Geofences** | Geofences currently turned ON (devices inside these will be captured) | Green |
| **Captured Devices** | Unique MAIDs harvested from the bidstream | Orange |
| **Unsynced** | Devices captured but not yet pushed to a DSP | Yellow |
| **Segments** | Audience segments created for DSP delivery | Purple |

### Generate Geofences from Supreme Line 2

This is the quickest way to populate geofences. It reads every company in the `supreme_companies` table that has latitude/longitude coordinates (from Supreme Line 2 geocoding) and creates a circular polygon geofence around each one.

**How to use:**

1. Run Supreme Line 1 to discover companies (keyword + city/state search)
2. Run Supreme Line 2 to geocode each company's address to lat/lng
3. Come to this tab and select a radius:
   - **100m** — very tight (device must be essentially at the business)
   - **250m** — tight (default; covers the business + immediate surrounding)
   - **500m** — medium (covers the business + neighboring shops)
   - **750m** — wide (covers a small shopping center)
   - **1000m** — very wide (covers a neighborhood block)
4. Click **Generate Geofences**
5. The system reports how many were created vs. skipped (already existed)

**What happens behind the scenes:**
- A PostGIS polygon is created for each company using `ST_Buffer` in Web Mercator (SRID 3857) for accurate metric buffering, then transformed back to WGS84 (SRID 4326)
- A database trigger (`update_geofence_geom`) auto-updates the geometry whenever lat/lng/radius changes
- A GIST spatial index enables millisecond `ST_Contains` lookups

### Pipeline Status

Shows the four-layer architecture and which layers are operational:

- **Layer 1: PostGIS Geofence Layer** — Shows count of active geofences
- **Layer 2: OpenRTB Bid Handler** — The auction endpoint at `/api/openrtb/auction`
- **Layer 3: Redis + ClickHouse** — Dedup, audience sets, and analytics warehouse
- **Layer 4: DSP API Sync** — MAID export and DSP API integration

### Capture Analytics (ClickHouse)

A live table from ClickHouse showing capture activity per geofence:

| Column | Description |
|--------|-------------|
| **Geofence** | Name of the geofence |
| **Captures** | Total bid requests that matched this geofence |
| **Unique Devices** | Distinct MAIDs captured |
| **First Capture** | Timestamp of first device capture |
| **Last Capture** | Timestamp of most recent device capture |

This data comes directly from the `device_captures` table in ClickHouse, queried with `GROUP BY geofence_name`.

### DSP Sync Quick Export

A shortcut button to download all captured MAIDs as a CSV file. Same as the export in the DSP Sync tab, but accessible from the dashboard.

---

## 2. Geofences Tab

A searchable, sortable table of all geofences in the system.

### Columns

| Column | Description |
|--------|-------------|
| **Name** | Geofence name (usually the company name from Supreme) |
| **Address** | Street address, city, state |
| **Lat** | Latitude (6 decimal places) |
| **Lng** | Longitude (6 decimal places) |
| **Radius** | Radius in metres |
| **Active** | ON/OFF toggle — only active geofences capture devices |
| **Actions** | Delete button (trash icon) |

### Actions

- **Toggle Active/Inactive:** Click the ON/OFF button. Inactive geofences are still in the database but devices inside them are NOT captured. Use this to pause a geofence without deleting it.
- **Delete:** Permanently removes the geofence. The PostGIS geometry and all index entries are removed.
- **Scroll:** The table shows up to 200 geofences at a time. If you have more, scroll within the table.

### When to Use This Tab

- **After generating geofences:** Verify they were created correctly with the right coordinates and radius
- **To pause a location:** Toggle a geofence OFF if a business closed or you want to stop capturing there
- **To clean up:** Delete geofences for businesses you no longer want to target

---

## 3. Captured Devices Tab

A live, auto-refreshing (every 5 seconds) table of every device captured by the bidstream.

### Columns

| Column | Description |
|--------|-------------|
| **MAID** | Mobile Advertising ID (IDFA/AAID) — the unique device identifier |
| **Device** | Manufacturer and model (e.g., "Google Pixel 8") |
| **OS** | Operating system and version (e.g., "Android 14.0") |
| **Geofence** | Which geofence the device was inside when captured |
| **Lat/Lng** | GPS coordinates at time of capture |
| **Hits** | How many bid requests matched this device (deduplicated by Redis) |
| **Synced** | Whether this MAID has been pushed to a DSP (shows DSP name or "pending") |
| **Last Seen** | Timestamp of most recent bid request from this device |

### How Devices Get Captured

A device is captured when:

1. An SSP/exchange sends a bid request to `/api/openrtb/auction`
2. The bid request contains `device.geo.lat` and `device.geo.lon`
3. The coordinates fall inside an active geofence (PostGIS `ST_Contains`)
4. The MAID is extracted from `device.ifa` (or `idfa`, `aaid`, `dpid`, `rida`)
5. Redis deduplicates (won't re-capture the same MAID within 5 minutes)
6. The device is upserted into PostgreSQL (`captured_devices` table)
7. The capture event is logged to ClickHouse (`device_captures` table)
8. The MAID is added to a Redis audience set for that geofence

### What You Can Do Here

- **Monitor live traffic:** Watch devices appear in real-time as bid requests come in
- **Verify capture quality:** Check that MAIDs, device info, and geofence matches look correct
- **Track sync status:** See which devices have been pushed to a DSP and which are pending

---

## 4. Audience Segments Tab

Audience segments group geofences together into a targetable audience for DSP delivery.

### Creating a Segment

1. Enter a **Segment Name** (e.g., "Poughkeepsie Auto Repair Audience")
2. Enter an optional **Description**
3. Click **Create Segment**

The segment automatically includes ALL currently active geofences. The system counts captured devices across those geofences as the segment's device count.

### Segment Table

| Column | Description |
|--------|-------------|
| **Name** | Segment name |
| **Description** | Optional description |
| **Geofences** | Number of geofences in this segment |
| **Devices** | Total captured devices across all included geofences |
| **Status** | Active or inactive |
| **Created** | Date created |

### When to Create Segments

- **By industry:** "Auto Repair Shops", "Dental Offices", "Coffee Shops"
- **By geography:** "Poughkeepsie Audience", "Hudson Valley Medical"
- **By campaign:** "Q1 Oil Change Campaign", "Holiday Dental Promotion"

Create a segment first, then use the DSP Sync tab to push it to an ad platform.

---

## 5. Bidstream Test Tab

A built-in tool to simulate OpenRTB bid requests without needing a real SSP connection. This lets you test your geofences and capture pipeline end-to-end.

### How to Use

1. **Latitude:** Enter a latitude that falls inside one of your geofences (default: 41.681427 — Poughkeepsie, NY)
2. **Longitude:** Enter the matching longitude (default: -73.855606)
3. **MAID (IFA):** A test device ID is auto-generated, or you can type your own
4. Click **Send Bid Request**

### What Happens

The tool sends a POST to `/api/openrtb/auction` with this payload:

```json
{
  "device": {
    "ifa": "your-maid-here",
    "geo": { "lat": 41.681427, "lon": -73.855606 },
    "os": "Android",
    "osv": "14.0",
    "make": "Google",
    "model": "Pixel 8"
  },
  "app": { "name": "TestApp" }
}
```

The response will be:
- **204 No Content** — device is outside all geofences, or inside a geofence but not in the target list (free harvest)
- **200 with bid response** — device is inside a geofence AND in the `audience:target_maids` Redis set (would bid $0.50 CPM)

### Testing Tips

- Use the lat/lng from the Geofences tab to test specific locations
- Send multiple requests with the same MAID to see the dedup in action (Redis 5-minute window)
- After sending a request, switch to the Captured Devices tab to see the device appear
- Check the Dashboard tab for ClickHouse analytics updating

---

## 6. DSP Sync Tab

The most complex tab — handles pushing captured audiences to Demand-Side Platforms (DSPs) for actual ad delivery.

### Selective Bidding Architecture

Two cards at the top explain the bidding model:

| Response | Scenario | Cost |
|----------|----------|------|
| **204** | Non-targeted MAID inside geofence | Free — we harvest the MAID for future targeting |
| **200** | Targeted MAID inside geofence | $0.50 CPM bid — we buy the impression |

This means you can capture devices for free (204 no-bid) and only spend money when you actively target a specific MAID.

### Automated DSP Audience Sync

Push captured MAIDs directly to a DSP via API. Two providers supported:

#### Epom (CSV Upload)

1. Select the **Epom** tab
2. Enter your **API Key** (from your Epom account)
3. Enter your **Network Domain** (e.g., `your-network.epom.com`)
4. Enter a **Segment Name** for the audience
5. Click **Sync to Epom**

The system uploads captured MAIDs as a CSV multipart form to Epom's API. Batches of 50,000 MAIDs with exponential backoff retry.

#### SmartyAds (JSON API)

1. Select the **SmartyAds** tab
2. Enter your **API Token** (from your SmartyAds DSP account)
3. Enter a **Segment Name**
4. Click **Sync to SmartyAds**

The system creates an audience segment via SmartyAds' JSON API and uploads MAIDs in batches.

### Sync History

After a sync completes, a history table appears showing:

| Column | Description |
|--------|-------------|
| **Provider** | Epom or SmartyAds |
| **Segment** | Audience segment name |
| **MAIDs** | Total devices in the upload |
| **Uploaded** | How many were successfully uploaded |
| **Status** | Success or failed |
| **Duration** | How long the sync took |

### Manual MAID Export (No API Needed)

If you don't have DSP API credentials yet, you can download all captured MAIDs as a CSV file and upload them manually to any DSP:

1. Click **Download MAIDs CSV**
2. The file contains all captured device IDs with geofence and device metadata
3. Upload to The Trade Desk, StackAdapt, Beeswax, or any DSP with bulk import

### Direct SDK Ingestion (Bypass SSP)

Mobile apps can send device data directly to your platform without going through an SSP/exchange. The endpoint is:

```
POST /api/ingest
Content-Type: application/json

{
  "lat": 41.681427,
  "lng": -73.855606,
  "maid": "device-idfa-xxx",
  "os": "iOS",
  "osv": "17.0",
  "make": "Apple",
  "model": "iPhone 15"
}
```

**Response (inside geofence):**
```json
{ "captured": true, "geofence": "J&J Auto", "new_device": true }
```

**Response (outside geofence):**
```json
{ "captured": false, "reason": "outside_geofence" }
```

Click **Test SDK Ingest** to simulate a direct SDK ping from the dashboard.

### Self-Serve DSP Registration

Quick links to register for self-serve DSP accounts:
- **SmartyAds** — self-serve, DSP API access, no minimum spend
- **Epom** — self-serve, no minimum, CSV bulk upload

---

## 7. API Reference

All endpoints are relative to your domain (e.g., `https://leadcaffeine.com`).

### Geofence Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/geofence` | Yes | List all geofences |
| `GET` | `/api/geofence/:id` | Yes | Get a single geofence |
| `POST` | `/api/geofence` | Yes | Create a geofence manually |
| `PATCH` | `/api/geofence/:id` | Yes | Update geofence (toggle active, change radius) |
| `DELETE` | `/api/geofence/:id` | Yes | Delete a geofence |
| `POST` | `/api/geofence/generate` | Yes | Auto-generate geofences from Supreme Line 2 data |
| `POST` | `/api/geofence/check` | Yes | Check if a lat/lng point falls inside any geofence |
| `POST` | `/api/geofence/capture` | Yes | Manually capture a device at a location |
| `GET` | `/api/geofence/stats` | Yes | Get dashboard statistics |
| `GET` | `/api/geofence/analytics` | Yes | Get ClickHouse capture analytics |

### Device Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/geofence/devices` | Yes | List captured devices (query: `?limit=100`) |
| `GET` | `/api/geofence/export-maids` | Yes | Download all captured MAIDs as CSV |

### Audience Segments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/geofence/segments` | Yes | List all segments |
| `POST` | `/api/geofence/segments` | Yes | Create a new segment |
| `POST` | `/api/geofence/maids` | Yes | Add MAIDs to a segment |

### Targeting

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/geofence/targeting/add` | Yes | Add a MAID to the target list (will bid $0.50) |
| `POST` | `/api/geofence/targeting/remove` | Yes | Remove a MAID from the target list |
| `GET` | `/api/geofence/targeting/count` | Yes | Count of targeted MAIDs |
| `GET` | `/api/geofence/targeting/list` | Yes | List all targeted MAIDs |

### OpenRTB Bidstream

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/openrtb/auction` | No | OpenRTB 2.5 auction endpoint (SSP-facing) |
| `GET` | `/api/openrtb/win` | No | Win notice (called by SSP when bid wins) |
| `GET` | `/api/openrtb/creative` | No | Creative pixel (1x1 tracking image) |
| `GET` | `/api/openrtb/click` | No | Click redirect |

### Direct SDK Ingestion

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/ingest` | No | Direct device ping (bypasses SSP) |

### DSP Sync

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/dsp/sync` | Yes | Push MAIDs to Epom or SmartyAds |
| `GET` | `/api/dsp/export-maids` | Yes | Download MAIDs as CSV |
| `GET` | `/api/dsp/logs` | Yes | Sync history logs |

---

## 8. Architecture

### The Four-Layer Pipeline

```
Layer 1: PostGIS Geofences
   ↓ (ST_Contains query)
Layer 2: OpenRTB Bid Handler
   ↓ (capture MAID)
Layer 3: Redis + ClickHouse
   ↓ (dedup, audience sets, analytics)
Layer 4: DSP Audience Sync
   ↓ (push MAIDs to ad platforms)
```

### Data Flow: Bid Request to Ad Delivery

1. **SSP sends bid request** → `POST /api/openrtb/auction`
   - Contains device GPS coordinates and MAID
2. **PostGIS lookup** → `ST_Contains(geom, ST_MakePoint(lng, lat))`
   - GIST index returns matching geofence in <1ms
3. **Redis dedup** → `SETEX maid:{id} 300`
   - Prevents re-capturing same device within 5 minutes
4. **PostgreSQL upsert** → `captured_devices` table
   - New device = INSERT, existing = UPDATE hit_count + last_seen
5. **Redis audience set** → `SADD audience:geofence:{id} {maid}`
   - Builds real-time audience sets per geofence
6. **ClickHouse log** → `device_captures` table
   - Analytics warehouse — captures, unique devices, timestamps
7. **Targeting check** → `SISMEMBER audience:target_maids {maid}`
   - If targeted: return $0.50 CPM bid (200)
   - If not targeted: return 204 no-bid (free harvest)
8. **DSP sync** → Push captured MAIDs to Epom/SmartyAds
   - CSV or JSON API, 50k batch chunks

### Selective Bidding Explained

The platform uses a "harvest then target" strategy:

**Phase 1: Harvest (Free)**
- All bid requests inside geofences are processed
- MAIDs are captured and stored regardless of targeting status
- The SSP sees a 204 no-bid (no cost to you)
- You're building an audience database for free

**Phase 2: Target (Paid)**
- Add specific MAIDs to the `audience:target_maids` Redis set
- When a targeted MAID enters a geofence, the platform bids $0.50 CPM
- The bid includes a creative pixel and click redirect
- Win notices are logged to ClickHouse for billing reconciliation

---

## 9. Common Workflows

### Workflow A: Full Pipeline (First Time)

1. **Supreme Line 1** → Discover companies by keyword + city/state
2. **Supreme Line 2** → Geocode each company to lat/lng
3. **Dashboard tab** → Generate geofences (250m radius recommended)
4. **Geofences tab** → Verify geofences look correct
5. **Bidstream Test tab** → Send a test bid request with coordinates inside a geofence
6. **Captured Devices tab** → Verify the device was captured
7. **Dashboard tab** → Check ClickHouse analytics updated
8. **Segments tab** → Create an audience segment from active geofences
9. **DSP Sync tab** → Sync to Epom or SmartyAds (or export CSV manually)
10. **Targeting API** → Add specific MAIDs to target list for $0.50 bidding

### Workflow B: Test the Full Capture Pipeline

1. Go to **Bidstream Test** tab
2. Copy a lat/lng from the **Geofences** tab
3. Paste into the test form
4. Click **Send Bid Request**
5. Switch to **Captured Devices** tab — device should appear within 5 seconds
6. Switch to **Dashboard** tab — ClickHouse analytics should show 1 capture
7. Click **Export MAIDs CSV** — the device should be in the file

### Workflow C: Start Paid Bidding

1. Capture devices using the free harvest (204 no-bid) approach
2. Review captured MAIDs in the **Captured Devices** tab
3. Identify high-value devices to target
4. Add them to the target list via API:
   ```
   POST /api/geofence/targeting/add
   { "maid": "device-idfa-xxx" }
   ```
5. From now on, when that device enters a geofence, the platform bids $0.50 CPM
6. Check ClickHouse `bid_wins` table for win notifications and billing

### Workflow D: Push Audience to DSP

1. Capture devices across multiple geofences
2. Go to **Segments** tab → Create a segment (groups all active geofences)
3. Go to **DSP Sync** tab
4. Choose your DSP (Epom or SmartyAds)
5. Enter credentials and segment name
6. Click **Sync** — MAIDs are uploaded in 50k batches
7. Check **Sync History** for success/failure
8. Or click **Download MAIDs CSV** for manual upload to any DSP

### Workflow E: Mobile SDK Integration

For mobile apps to ping your platform directly (no SSP needed):

```javascript
// In your mobile app or web SDK
fetch('https://leadcaffeine.com/api/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lat: deviceLatitude,
    lng: deviceLongitude,
    maid: deviceAdvertisingId,
    os: 'iOS',
    osv: '17.0',
    make: 'Apple',
    model: 'iPhone 15'
  })
});
```

The endpoint returns whether the device was captured and which geofence it matched.

---

## 10. Troubleshooting

### No devices appearing in Captured Devices

**Cause:** No bid requests are reaching the auction endpoint, or coordinates are outside all geofences.

**Fix:**
1. Use the **Bidstream Test** tab to send a test request with coordinates from a geofence
2. Verify the geofence is **Active** (ON) in the Geofences tab
3. Check that the lat/lng in the test request actually falls inside the geofence polygon

### ClickHouse analytics not updating

**Cause:** ClickHouse connection failed or the `device_captures` table doesn't exist.

**Fix:**
1. Verify ClickHouse is running (check Render dashboard)
2. Verify `CLICKHOUSE_URL` and `CLICKHOUSE_PASSWORD` env vars are set on the web service
3. Run the init script: `node scripts/init-production.mjs` from the web service shell

### "Session save failed" on login

**Cause:** The `user_sessions` table doesn't exist in PostgreSQL.

**Fix:**
1. Ensure `DATABASE_URL` is set correctly in the web service Environment tab
2. The table is now auto-created on startup — redeploy the web service

### DSP sync fails

**Cause:** Invalid credentials or DSP API is down.

**Fix:**
1. Verify your Epom API key and network domain, or SmartyAds API token
2. Check the sync history table for error details
3. Use **Download MAIDs CSV** as a fallback for manual upload

### Geofence generation shows 0 created

**Cause:** No companies in `supreme_companies` table have latitude/longitude coordinates.

**Fix:**
1. Run Supreme Line 1 first to discover companies
2. Run Supreme Line 2 to geocode their addresses
3. Verify companies have lat/lng in the Supreme tab before generating geofences

### Bid request returns 204 but device not captured

**Cause:** The coordinates might not fall inside any geofence polygon.

**Fix:**
1. Use the exact lat/lng from a geofence in the Geofences tab
2. Remember the geofence is a circle — if you're testing with coordinates near the edge, try the exact center coordinates
3. Check that the geofence is active (ON)
4. If the MAID was captured recently (within 5 minutes), Redis dedup may be blocking it — try a different MAID
