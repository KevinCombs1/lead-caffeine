# Lead Caffeine — Geofence Platform How-To Guide v2

> **v2 adds:** Campaign Builder with multi-campaign support, per-campaign CPM bidding, CSV geofence upload, image/video ad creative management, Supreme Line 2 → Campaign CSV export, and smart CSV column detection.

The Geofence tab is the operational hub for your hyperlocal advertising engine. It connects five pipeline layers — PostGIS geofences, OpenRTB bidstream processing, Redis/ClickHouse analytics, DSP audience sync, and Campaign Builder with creative delivery — into one dashboard.

---

## Table of Contents

1. [Dashboard Tab — Overview & Quick Start](#1-dashboard-tab)
2. [Geofences Tab — Managing Geofences](#2-geofences-tab)
3. [Captured Devices Tab — Device Intelligence](#3-captured-devices-tab)
4. [Audience Segments Tab — Building Audiences](#4-audience-segments-tab)
5. [Bidstream Test Tab — Simulating Bid Requests](#5-bidstream-test-tab)
6. [DSP Sync Tab — Pushing Audiences to Ad Platforms](#6-dsp-sync-tab)
7. [Campaigns Tab — Campaign Builder (NEW)](#7-campaigns-tab)
8. [API Reference — All Endpoints](#8-api-reference)
9. [Architecture — How It All Works](#9-architecture)
10. [Common Workflows — Step by Step](#10-common-workflows)
11. [Troubleshooting](#11-troubleshooting)
12. [Plain English Guide — How to Actually Use This Thing](#12-plain-english-guide)
13. [Which Routes Get What CPMs](#13-which-routes-get-what-cpms)

---

## 1. Dashboard Tab

The Dashboard is your at-a-glance overview of the entire pipeline. It has five sections.

### Stat Cards (Top Row)

Five cards show live metrics, refreshing every 5 seconds:

| Card | What It Shows | Color |
|------|--------------|-------|
| **Total Geofences** | All geofences in the database (across all campaigns + Supreme-generated) | Blue |
| **Active Geofences** | Geofences currently turned ON | Green |
| **Captured Devices** | Unique MAIDs harvested from the bidstream | Orange |
| **Unsynced** | Devices captured but not yet pushed to a DSP | Yellow |
| **Segments** | Audience segments created for DSP delivery | Purple |

### Generate Geofences from Supreme Line 2

Creates polygon geofences around every geocoded company from Supreme Line 2.

1. Select a radius (100m, 250m, 500m, 750m, or 1000m)
2. Click **Generate Geofences**
3. The system creates PostGIS polygons with GIST spatial index

> **v2 note:** For per-campaign geofences, use the Campaigns tab instead. This button creates geofences not linked to any specific campaign.

### Pipeline Status

Shows the five-layer architecture status:

| Layer | Description |
|-------|-------------|
| 1. PostGIS Geofence Layer | Geofence polygons with spatial index |
| 2. OpenRTB Bid Handler | Auction endpoint with campaign-aware bidding |
| 3. Redis + ClickHouse | Dedup, audience sets, analytics warehouse |
| 4. DSP API Sync | MAID CSV export + DSP API integration |
| 5. Campaign Builder (NEW) | Multi-campaign creatives with per-campaign CPM |

### Capture Analytics (ClickHouse)

Live table from ClickHouse showing capture activity per geofence — total captures, unique devices, first/last capture timestamps.

### DSP Sync Quick Export

Shortcut button to download all captured MAIDs as a CSV file.

---

## 2. Geofences Tab

A searchable, sortable table of all geofences in the system — including geofences created by Supreme, CSV upload, or manually.

### Columns

| Column | Description |
|--------|-------------|
| **Name** | Geofence name (usually the company name) |
| **Address** | Street address, city, state |
| **Lat / Lng** | GPS coordinates (6 decimal places) |
| **Radius** | Radius in metres |
| **Active** | ON/OFF toggle |
| **Actions** | Delete button |

### Actions

- **Toggle ON/OFF** — Pauses a geofence without deleting it. Inactive geofences don't capture devices.
- **Delete** — Permanently removes the geofence.

> **v2 note:** Geofences created via CSV upload in the Campaigns tab will also appear here. Their source will show as `csv_upload`.

---

## 3. Captured Devices Tab

A live, auto-refreshing (every 5 seconds) table of every device captured by the bidstream.

### Columns

| Column | Description |
|--------|-------------|
| **MAID** | Mobile Advertising ID (IDFA/AAID) |
| **Device** | Manufacturer and model |
| **OS** | Operating system and version |
| **Geofence** | Which geofence the device was inside when captured |
| **Lat/Lng** | GPS coordinates at time of capture |
| **Hits** | How many bid requests matched this device |
| **Synced** | Whether this MAID has been pushed to a DSP |
| **Last Seen** | Timestamp of most recent bid request |

### How Devices Get Captured

1. SSP/exchange sends bid request to `/api/openrtb/auction`
2. Bid request contains `device.geo.lat` and `device.geo.lon`
3. Coordinates fall inside an active geofence (PostGIS `ST_Contains`)
4. MAID extracted from `device.ifa`
5. Redis deduplicates (5-minute window)
6. Device upserted into PostgreSQL
7. Capture event logged to ClickHouse
8. MAID added to Redis audience set for that geofence

---

## 4. Audience Segments Tab

Audience segments group geofences together into a targetable audience for DSP delivery.

### Creating a Segment

1. Enter a **Segment Name** (e.g., "Poughkeepsie Auto Repair Audience")
2. Enter an optional **Description**
3. Click **Create Segment**

The segment includes ALL currently active geofences. Captured devices across those geofences become the audience.

---

## 5. Bidstream Test Tab

A built-in tool to simulate OpenRTB bid requests without needing a real SSP connection.

### How to Use

1. Enter a **Latitude** and **Longitude** that falls inside one of your geofences
2. A test **MAID** is auto-generated (or type your own)
3. Click **Send Bid Request**

### Response Codes

| Response | Meaning |
|----------|---------|
| **204** | Device is outside all geofences, OR inside a geofence but no active campaign/creative matches |
| **200** | Device is inside a geofence linked to an active campaign with a matching creative — bid returned at the campaign's CPM |

> **v2 change:** The auction handler now checks for campaigns linked to the matched geofence before falling back to the Redis target_maids logic. If a campaign with matching creatives exists, it bids at the campaign's CPM with the campaign's creative.

---

## 6. DSP Sync Tab

Push captured audiences to Demand-Side Platforms (DSPs) for ad delivery.

### Selective Bidding Architecture

| Response | Scenario | Cost |
|----------|----------|------|
| **204** | Non-targeted MAID, no campaign match | Free harvest |
| **200** | Campaign match with creative | Campaign's CPM (per-campaign, not hardcoded) |

### Automated DSP Audience Sync

#### Epom (CSV Upload)
1. Select **Epom** tab
2. Enter **API Key** and **Network Domain**
3. Enter **Segment Name**
4. Click **Sync to Epom**
5. Uploads in batches of 50,000 with retry

#### SmartyAds (JSON API)
1. Select **SmartyAds** tab
2. Enter **API Token**
3. Enter **Segment Name**
4. Click **Sync to SmartyAds**

### Manual MAID Export (No API Needed)

Download all captured MAIDs as a CSV file. Upload manually to any DSP.

### Direct SDK Ingestion

Mobile apps can ping `POST /api/ingest` directly with JSON — no SSP needed.

### Self-Serve DSP Registration

Quick links to register for SmartyAds and Epom self-serve accounts.

---

## 7. Campaigns Tab (NEW in v2)

The Campaign Builder is where you create and manage advertising campaigns. Each campaign has its own:
- **Geofences** (uploaded via CSV or linked from existing)
- **Ad creatives** (images or video, uploaded directly)
- **CPM bid price** (set per campaign, not hardcoded)
- **Budgets** (optional daily and total spend caps)
- **Stats** (impressions, clicks, wins, spend — tracked automatically)

### Campaign List

The default view shows all campaigns. Each card shows:
- Campaign name and status (active/paused/archived)
- Per-campaign CPM bid
- Total impressions and clicks
- Click any campaign to open its detail page

### Creating a Campaign

1. Click **New Campaign**
2. Fill in:
   - **Campaign Name** (required) — e.g., "Q1 Auto Repair Poughkeepsie"
   - **Description** (optional)
   - **Bid CPM** (default $0.50) — this is what you pay per 1,000 impressions
   - **Daily Budget** (optional) — spending cap per day
   - **Total Budget** (optional) — total spending cap
   - **Start Date** and **End Date** (optional)
3. Click **Create Campaign**

### Campaign Detail Page

The detail page has five sections:

#### Stats Bar

Shows Bid CPM, total Impressions, Clicks, and Spent — updating live as the campaign runs.

#### Settings

- **Status dropdown** — switch between active, paused, archived
- **Bid CPM field** — change the bid price anytime (updates take effect immediately on the next bid request)

#### Upload Geofences CSV

Upload a CSV with pre-geocoded businesses to create geofences for this campaign.

**Supported CSV format:**
```
name,latitude,longitude,radius_m,address,city,state
J&J Auto Repair,41.681427,-73.855606,250,123 Main St,Poughkeepsie,NY
```

**Smart column detection:** The parser auto-detects columns by header name, so you can also upload any of the existing Supreme exports (Meta, Basis, StackAdapt format). It will find the right columns regardless of order. Radius can be in yards, miles, km, or metres — it auto-converts to metres.

**Export from Supreme:** Download a campaign-ready CSV directly from the Supreme tab using the "Export Campaign CSV" endpoint (`/api/supreme/line2/export/campaign?jobId=YOUR_JOB_ID`). This outputs the exact format the Campaign Builder expects, with radius auto-converted from yards to metres.

**How to upload:**
1. Click **Upload CSV**
2. Select a .csv file from your computer
3. Geofences are created with `source='csv_upload'` and automatically linked to this campaign
4. You'll see a success message showing how many were created vs. skipped

#### Linked Geofences

Shows all geofences currently linked to this campaign. You can:
- **Unlink** a geofence (removes it from the campaign but doesn't delete it)
- **Link existing geofences** from the list below (geofences not yet linked to this campaign)
- **Link all** — one click to link every unlinked geofence

#### Ad Creatives

Upload and manage image and video creatives for this campaign.

**Supported formats:**
- **Images:** PNG, JPG, GIF, WebP (up to 10MB)
- **Video:** MP4, WebM (up to 50MB)

**How to upload:**
1. Click **Upload Creative (Image or Video)**
2. Select a file from your computer
3. The file is stored on the Render persistent disk
4. A preview thumbnail appears (images show inline, video shows with player)
5. Each creative gets a public URL: `https://leadcaffeine.com/api/creative/{id}`

**Creative serving in the auction:**
- When a device enters a geofence linked to this campaign:
  - If the impression is a **banner** (`imp.banner`): the system finds an image creative and returns `<a href="clickUrl"><img src="creative-url"></a>` as the ad markup
  - If the impression is a **video** (`imp.video`): the system finds a video creative and returns VAST 4.0 XML pointing to the video file
  - If no creative matches the impression type: returns 204 no-bid (no cost)
- The bid price is the campaign's CPM (not the old hardcoded $0.50)

**Deleting a creative:** Click the trash icon. The file is removed from disk and the database.

### How Campaigns Interact with the Auction

When a bid request comes in and a device is inside a geofence:

1. The system looks up which campaigns are linked to that geofence
2. If one or more active campaigns exist:
   - Picks the first active campaign
   - Checks if it has a creative matching the impression type (banner → image, video → video)
   - If yes: bids at that campaign's CPM with that creative
   - If no: returns 204 (free harvest, no bid)
3. If no campaigns are linked to the geofence:
   - Falls back to the old Redis `audience:target_maids` logic
   - If the MAID is in the target list: bids $0.50 CPM (legacy behavior)
   - If not: returns 204 (free harvest)

This means campaigns take priority over the legacy targeting system. If a geofence has a campaign, the campaign's CPM and creatives are used. If no campaign, the old $0.50 target list logic applies.

### Running Multiple Campaigns Simultaneously

You can have many campaigns active at the same time:
- Each campaign has its own geofences, creatives, and CPM
- A single geofence can only be linked to campaigns that have matching creatives for the impression type
- If multiple campaigns link to the same geofence, the first active campaign with a matching creative wins the bid
- Budgets are tracked per campaign — when a campaign hits its budget cap, you should set it to "paused"

### Campaign Status Flow

| Status | Behavior |
|--------|----------|
| **active** | Campaign bids on impressions, creatives are served, stats are tracked |
| **paused** | Campaign is dormant — no bids, no spend. Geofences stay linked. |
| **archived** | Campaign is hidden from active rotation. Can be reactivated by setting to "active". |

---

## 8. API Reference

All endpoints are relative to your domain (e.g., `https://leadcaffeine.com`).

### Geofence Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/geofence` | Yes | List all geofences |
| `GET` | `/api/geofence/:id` | Yes | Get a single geofence |
| `POST` | `/api/geofence` | Yes | Create a geofence manually |
| `PATCH` | `/api/geofence/:id` | Yes | Update geofence (toggle active, change radius) |
| `DELETE` | `/api/geofence/:id` | Yes | Delete a geofence |
| `POST` | `/api/geofence/generate` | Yes | Auto-generate geofences from Supreme Line 2 |
| `POST` | `/api/geofence/check` | Yes | Check if a lat/lng falls inside any geofence |
| `POST` | `/api/geofence/capture` | Yes | Manually capture a device |
| `GET` | `/api/geofence/stats` | Yes | Dashboard statistics |
| `GET` | `/api/geofence/analytics` | Yes | ClickHouse capture analytics |

### Device Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/geofence/devices` | Yes | List captured devices (`?limit=100`) |
| `GET` | `/api/geofence/export-maids` | Yes | Download captured MAIDs as CSV |

### Audience Segments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/geofence/segments` | Yes | List all segments |
| `POST` | `/api/geofence/segments` | Yes | Create a new segment |
| `POST` | `/api/geofence/maids` | Yes | Add MAIDs to a segment |

### Targeting (Legacy — use Campaigns instead)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/geofence/targeting/add` | Yes | Add a MAID to the target list ($0.50 bidding) |
| `POST` | `/api/geofence/targeting/remove` | Yes | Remove a MAID from the target list |
| `GET` | `/api/geofence/targeting/count` | Yes | Count of targeted MAIDs |
| `GET` | `/api/geofence/targeting/list` | Yes | List all targeted MAIDs |

### Campaigns (NEW)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/campaigns` | Yes | List all campaigns (`?status=active`) |
| `GET` | `/api/campaigns/:id` | Yes | Get campaign with geofences and creatives |
| `POST` | `/api/campaigns` | Yes | Create campaign (name, bidPriceCpm, budgets, dates) |
| `PATCH` | `/api/campaigns/:id` | Yes | Update campaign (status, bidPriceCpm, budgets) |
| `DELETE` | `/api/campaigns/:id` | Yes | Delete campaign (cascades to creatives and links) |

### Campaign Geofences (NEW)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/campaigns/:id/geofences` | Yes | List geofences linked to campaign |
| `POST` | `/api/campaigns/:id/geofences` | Yes | Link geofence(s) to campaign (body: `{geofenceIds: []}`) |
| `DELETE` | `/api/campaigns/:id/geofences/:geofenceId` | Yes | Unlink geofence from campaign |
| `POST` | `/api/campaigns/:id/upload-csv` | Yes | Upload CSV to create + link geofences (body: `{csv: "..."}`) |

### Creatives (NEW)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/campaigns/:id/creatives` | Yes | List creatives for a campaign |
| `POST` | `/api/campaigns/:id/creatives` | Yes | Upload creative (multipart file upload) |
| `GET` | `/api/creative/:id` | No | Serve creative file (public — SSP loads this) |
| `GET` | `/api/creative/:id/vast` | No | Serve VAST 4.0 XML for video creatives |
| `DELETE` | `/api/creatives/:id` | Yes | Delete creative (removes file + DB row) |

### Supreme → Campaign Export (NEW)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/supreme/line2/export/campaign?jobId=X` | Yes | Download campaign-ready CSV (name, lat, lng, radius_m, address, city, state) |

### OpenRTB Bidstream

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/openrtb/auction` | No | OpenRTB 2.5 auction endpoint (campaign-aware bidding) |
| `GET` | `/api/openrtb/win` | No | Win notice (called by SSP when bid wins) |
| `GET` | `/api/openrtb/creative` | No | Legacy creative pixel |
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

## 9. Architecture

### The Five-Layer Pipeline

```
Layer 1: PostGIS Geofences
   ↓ (ST_Contains query)
Layer 2: OpenRTB Bid Handler (campaign-aware)
   ↓ (capture MAID, check campaigns)
Layer 3: Redis + ClickHouse
   ↓ (dedup, audience sets, analytics)
Layer 4: DSP Audience Sync
   ↓ (push MAIDs to ad platforms)
Layer 5: Campaign Builder (NEW)
   ↓ (per-campaign creatives, CPM, budgets)
```

### Data Flow: Bid Request to Ad Delivery (v2)

1. **SSP sends bid request** → `POST /api/openrtb/auction`
2. **PostGIS lookup** → `ST_Contains(geom, ST_MakePoint(lng, lat))` — finds matching geofence
3. **Redis dedup** → prevents re-capturing same device within 5 minutes
4. **PostgreSQL upsert** → `captured_devices` table (new device = INSERT, existing = UPDATE)
5. **Redis audience set** → `SADD audience:geofence:{id} {maid}`
6. **ClickHouse log** → `device_captures` table (analytics warehouse)
7. **Campaign check (NEW)** → `getActiveCampaignsForGeofence(match.id)`
   - If active campaign found with matching creative:
     - Banner impression → image creative → bid at campaign CPM
     - Video impression → VAST XML → bid at campaign CPM
     - No matching creative → 204 no-bid (free harvest)
   - If no campaign found:
     - Fall back to Redis `audience:target_maids` check
     - Targeted → $0.50 bid (legacy)
     - Not targeted → 204 no-bid (free harvest)
8. **Win notice** → `GET /api/openrtb/win` logs to ClickHouse `bid_wins` table
9. **Stats increment** → campaign impressions, clicks, wins, spend updated

---

## 10. Common Workflows

### Workflow A: Full Pipeline with Campaigns (v2)

1. **Supreme Line 1** → Discover companies by keyword + city/state
2. **Supreme Line 2** → Geocode each company to lat/lng
3. **Supreme tab** → Download Campaign CSV: `GET /api/supreme/line2/export/campaign?jobId=YOUR_JOB_ID`
4. **Geofence → Campaigns tab** → Click "New Campaign"
   - Name it (e.g., "Q1 Auto Repair Poughkeepsie")
   - Set your CPM bid (e.g., $0.75)
   - Set optional budgets and dates
   - Click "Create Campaign"
5. **Campaign detail → Upload Geofences CSV** → Upload the CSV from Step 3
6. **Campaign detail → Upload Creative** → Upload an image (PNG/JPG) or video (MP4)
7. **Bidstream Test tab** → Test with coordinates inside one of the campaign's geofences
8. **Captured Devices tab** → Verify the device was captured
9. **Campaign detail** → Check that impressions counter incremented
10. **DSP Sync tab** → Export captured MAIDs for additional DSP targeting

### Workflow B: Multiple Campaigns for Different Industries

1. Run Supreme for "auto repair" in Poughkeepsie → Export Campaign CSV
2. Run Supreme for "dentist" in Poughkeepsie → Export Campaign CSV
3. Create Campaign A: "Auto Repair Ads" → $0.75 CPM → Upload auto CSV → Upload auto ad image
4. Create Campaign B: "Dental Ads" → $0.30 CPM → Upload dental CSV → Upload dental ad image
5. Both campaigns run simultaneously
6. Devices entering auto repair geofences see auto ads at $0.75 CPM
7. Devices entering dental geofences see dental ads at $0.30 CPM
8. Each campaign tracks its own impressions, clicks, and spend independently

### Workflow C: Test the Full Capture Pipeline

1. Go to **Bidstream Test** tab
2. Copy a lat/lng from a geofence linked to your campaign
3. Paste into the test form
4. Click **Send Bid Request**
5. If the campaign has a matching creative → you'll get a 200 response with the bid
6. Switch to **Captured Devices** tab — device should appear
7. Switch to **Campaigns** → open your campaign — impressions should increment

### Workflow D: Start Paid Bidding (Two Options)

**Option 1: Campaign-based (recommended)**
1. Create a campaign with your desired CPM
2. Upload geofences (CSV) and creatives (image/video)
3. Set campaign to "active"
4. The system automatically bids at your CPM when devices enter those geofences
5. Track spend in the campaign stats

**Option 2: Legacy target list**
1. Capture devices using the free harvest (204 no-bid)
2. Add specific MAIDs to the target list via API
3. The system bids $0.50 CPM for those specific devices
4. Use this only for geofences NOT linked to a campaign

### Workflow E: Push Audience to DSP

1. Capture devices across multiple geofences
2. Go to **Segments** tab → Create a segment
3. Go to **DSP Sync** tab → Sync to Epom or SmartyAds (or download CSV)
4. The DSP runs retargeting campaigns to those captured MAIDs

### Workflow F: Mobile SDK Integration

```javascript
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

---

## 11. Troubleshooting

### No devices appearing in Captured Devices

**Cause:** No bid requests reaching the auction endpoint, or coordinates outside all geofences.

**Fix:**
1. Use the **Bidstream Test** tab with coordinates from a linked geofence
2. Verify the geofence is **Active** (ON)
3. Check that the lat/lng actually falls inside the geofence

### ClickHouse analytics not updating

**Cause:** ClickHouse connection failed or `device_captures` table doesn't exist.

**Fix:**
1. Verify ClickHouse is running on Render
2. Verify `CLICKHOUSE_URL` and `CLICKHOUSE_PASSWORD` env vars
3. Run `node scripts/init-production.mjs` from the web service shell

### "Session save failed" on login

**Cause:** `user_sessions` table doesn't exist.

**Fix:** The table is now auto-created on startup. Redeploy the web service.

### Campaign bids not firing (204 instead of 200)

**Cause:** No creative matching the impression type, or campaign is paused/archived.

**Fix:**
1. Open the campaign detail page
2. Verify campaign status is "active"
3. Verify at least one creative is uploaded
4. For banner impressions: upload an image creative
5. For video impressions: upload a video creative
6. Verify the geofence is linked to the campaign

### CSV upload fails or creates 0 geofences

**Cause:** CSV format doesn't match expected columns, or no valid lat/lng values.

**Fix:**
1. Use the Supreme export endpoint: `/api/supreme/line2/export/campaign?jobId=X`
2. The smart parser auto-detects columns by header name
3. Ensure each row has a name, latitude, and longitude
4. Radius is optional (defaults to 250m) — accepts yards, miles, km, or metres

### Creative not showing on devices

**Cause:** Creative URL not accessible, or SSP doesn't render the ad markup.

**Fix:**
1. Open the creative URL directly in a browser: `https://leadcaffeine.com/api/creative/{id}`
2. If it loads, the creative is served correctly
3. The SSP must support image creatives (banner) or VAST XML (video)
4. Check that the creative's campaign is "active"

### DSP sync fails

**Fix:**
1. Verify Epom API key + network domain, or SmartyAds API token
2. Check sync history for error details
3. Use **Download MAIDs CSV** as a fallback

---

## 12. Plain English Guide

### What This Platform Does (In One Sentence)

It draws invisible circles around businesses on a map, and when people's phones enter those circles, it shows them your ad — at a price you control per campaign.

### The Short Version (TL;DR)

1. **Supreme tab** → Find businesses and get their GPS coordinates
2. **Supreme tab** → Download Campaign CSV (ready for upload)
3. **Geofence → Campaigns** → Create a campaign with your CPM and budget
4. **Campaign detail** → Upload the CSV (creates geofences) and upload ad images/video
5. **Geofence → Bidstream Test** → Test that it captures phones and bids
6. **Geofence → Captured Devices** → Watch phones get captured
7. **Campaign detail** → Check impressions and spend
8. **Geofence → DSP Sync** → Download captured MAIDs for DSP retargeting

### Step-by-Step for Non-Technical Users

#### Step 1: Find Businesses (Supreme Tab)

1. Click **Supreme** tab
2. **Line 1:** Type city/state + keywords → Start → wait for results
3. **Line 2:** Run Line 2 to geocode addresses to GPS coordinates
4. Download the Campaign CSV (this gives you a file ready for Step 3)

#### Step 2: Create a Campaign (Geofence → Campaigns Tab)

1. Click **Geofence** tab → **Campaigns** sub-tab
2. Click **New Campaign**
3. Type a name (e.g., "Q1 Auto Repair Poughkeepsie")
4. Set your bid price (CPM) — this is what you pay per 1,000 ad views
5. Optionally set a daily or total budget cap
6. Click **Create Campaign**

#### Step 3: Upload Geofences (Campaign Detail → Upload CSV)

1. Open your campaign
2. Click **Upload CSV** in the geofences section
3. Select the CSV file you downloaded in Step 1
4. Geofences are created and linked to this campaign automatically

#### Step 4: Upload Your Ad (Campaign Detail → Upload Creative)

1. In the same campaign detail page
2. Click **Upload Creative (Image or Video)**
3. Select an image (PNG, JPG, GIF, WebP up to 10MB) or video (MP4, WebM up to 50MB)
4. A preview appears in the UI
5. This ad will be shown to devices that enter your geofences

#### Step 5: Test It (Geofence → Bidstream Test)

1. Copy a latitude/longitude from one of your campaign's geofences
2. Paste into the Bidstream Test form
3. Click **Send Bid Request**
4. If you get a 200 response, your campaign is bidding with your creative

#### Step 6: Watch It Run

- **Captured Devices tab** — See phones being captured
- **Campaign detail** — Watch impressions, clicks, and spend accumulate
- **Dashboard tab** — See overall stats and ClickHouse analytics

#### Step 7: Export for DSP Retargeting (Optional)

1. Go to **DSP Sync** tab
2. Download MAIDs CSV or sync to Epom/SmartyAds
3. Retarget captured devices on other ad platforms

### Quick Reference: What Each Tab Does

| Tab | What It Does | When to Use It |
|-----|-------------|----------------|
| **Dashboard** | Stats overview + generate geofences from Supreme | Check your numbers |
| **Geofences** | List all geofences with on/off switches | Manage individual geofences |
| **Captured Devices** | Live feed of captured phone IDs | See who's visiting target businesses |
| **Segments** | Group geofences into audiences | Before DSP sync |
| **Bidstream Test** | Test with fake phone pings | Verify system works |
| **DSP Sync** | Send phone IDs to ad platforms | Start retargeting |
| **Campaigns** | Create campaigns, upload CSVs + creatives, set CPM | Run ad campaigns with custom creatives |

---

## 13. Which Routes Get What CPMs

### The Two Bidding Paths

| Path | Route | Outcome | CPM | Who Pays | When |
|------|-------|---------|-----|---------|------|
| **Campaign** | `POST /api/openrtb/auction` | **200 Bid** | Campaign's CPM | You | Geofence linked to active campaign with matching creative |
| **Legacy Target** | `POST /api/openrtb/auction` | **200 Bid** | $0.50 (hardcoded) | You | MAID in `audience:target_maids` Redis set, no campaign on geofence |
| **Free Harvest** | `POST /api/openrtb/auction` | **204 No-Bid** | $0.00 | Nobody | Device in geofence but no campaign and not in target list |
| **Outside** | `POST /api/openrtb/auction` | **204 No-Bid** | $0.00 | Nobody | Device outside all geofences |

### How Campaign Bidding Works

The auction handler checks in this order:

1. **Campaign check** (new): Is the matched geofence linked to an active campaign with a matching creative?
   - Yes → Bid at **campaign's CPM** with campaign's creative → 200 response
   - No → Continue to step 2
2. **Legacy target check**: Is the MAID in the Redis target list?
   - Yes → Bid at **$0.50 CPM** with generic creative → 200 response
   - No → Return 204 (free harvest)

### All Routes and Their Costs

| Route | Method | Cost | Notes |
|-------|--------|------|-------|
| `/api/openrtb/auction` | POST | **$0.00 or campaign CPM** | Free harvest (204) or campaign bid (200) |
| `/api/openrtb/win` | GET | $0.00 | Win notice — logs actual price to ClickHouse |
| `/api/openrtb/creative` | GET | $0.00 | Legacy tracking pixel |
| `/api/openrtb/click` | GET | $0.00 | Click redirect |
| `/api/ingest` | POST | **$0.00** | Direct SDK — always free, never bids |
| `/api/creative/:id` | GET | $0.00 | Serves creative file (public) |
| `/api/creative/:id/vast` | GET | $0.00 | Serves VAST XML for video (public) |
| `/api/campaigns` | POST | $0.00 | Create campaign |
| `/api/campaigns/:id/creatives` | POST | $0.00 | Upload creative |
| `/api/campaigns/:id/upload-csv` | POST | $0.00 | Upload geofences CSV |
| `/api/supreme/line2/export/campaign` | GET | $0.00 | Download campaign-ready CSV |
| `/api/geofence/generate` | POST | $0.00 | Generate geofences from Supreme |
| `/api/geofence/export-maids` | GET | $0.00 | Download captured MAIDs |
| `/api/dsp/sync` | POST | $0.00 | Push MAIDs to DSP |
| `/api/geofence/targeting/add` | POST | $0.00 | Add MAID to legacy target list |

### How to Set Per-Campaign CPM

When creating a campaign:
```
POST /api/campaigns
{
  "name": "Q1 Auto Repair",
  "bidPriceCpm": 0.75,
  "dailyBudget": 50.00,
  "totalBudget": 500.00
}
```

Change it anytime:
```
PATCH /api/campaigns/:id
{ "bidPriceCpm": 1.00 }
```

Or use the Bid CPM field in the Campaign detail page UI.

### Cost Summary (Plain English)

- **Finding businesses and drawing circles:** Free
- **Capturing phone IDs:** Free
- **Uploading creatives:** Free
- **Uploading geofence CSVs:** Free
- **Downloading phone IDs:** Free
- **Bidding on impressions:** Campaign's CPM per 1,000 impressions (you set the price per campaign)
- **Direct SDK pings:** Free
- **Legacy target list bidding:** $0.50 per 1,000 impressions (only for geofences without campaigns)
