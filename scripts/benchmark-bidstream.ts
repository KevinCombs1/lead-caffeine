/**
 * Software Build 1 — High-Concurrency Benchmark & Load Simulator
 *
 * Stress-tests the OpenRTB auction endpoint under configurable QPS.
 * Generates realistic bid requests with:
 *   - 80% coordinates outside any geofence (random US locations)
 *   - 20% coordinates matching exact active geofence points
 *   - 5% of geofence-matching requests include targeted MAIDs
 *
 * Usage:
 *   npx tsx scripts/benchmark-bidstream.ts --qps 250 --duration 30
 */

import { randomUUID } from "crypto";

// ── Configuration ─────────────────────────────────────────────────────────
const QPS = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--qps") || "250");
const DURATION = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--duration") || "30");
const ENDPOINT = process.argv.find((_, i, a) => a[i - 1] === "--endpoint") || "http://localhost:5001/api/openrtb/auction";

// ── Geofence coordinates (fetched from the API) ───────────────────────────
interface Geofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

async function fetchGeofences(): Promise<Geofence[]> {
  try {
    const res = await fetch("http://localhost:5001/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.SCANNER_PASSWORD || "LightEngine" }),
    });
    const cookies = res.headers.get("set-cookie") || "";
    const res2 = await fetch("http://localhost:5001/api/geofence", {
      headers: { Cookie: cookies },
    });
    const data = await res2.json();
    return data.map((g: any) => ({
      id: g.id,
      name: g.name,
      latitude: g.latitude,
      longitude: g.longitude,
    }));
  } catch {
    // Fallback: use known Poughkeepsie coordinates
    return [
      { id: "fallback-1", name: "J & J Automotive", latitude: 41.681427, longitude: -73.855606 },
      { id: "fallback-2", name: "North Road Auto", latitude: 41.718353, longitude: -73.930690 },
      { id: "fallback-3", name: "Stofa's Auto", latitude: 41.685097, longitude: -73.906715 },
    ];
  }
}

// ── Target MAIDs (pre-seeded for testing) ────────────────────────────────
const TARGET_MAIDS = Array.from({ length: 50 }, (_, i) => `target-maid-${String(i).padStart(3, "0")}`);

// ── Mock data generation ─────────────────────────────────────────────────

function randomMaid(): string {
  return randomUUID();
}

function randomUSLocation(): { lat: number; lon: number } {
  // Random point in continental US (roughly)
  const lat = 25 + Math.random() * 23; // 25°N to 48°N
  const lon = -125 + Math.random() * 58; // -125°W to -67°W
  return { lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)) };
}

function randomGeofenceLocation(geofences: Geofence[]): { lat: number; lon: number; geofence: Geofence } {
  const gf = geofences[Math.floor(Math.random() * geofences.length)];
  // Add small jitter (±50m) to simulate devices near the geofence
  const jitterLat = (Math.random() - 0.5) * 0.001;
  const jitterLon = (Math.random() - 0.5) * 0.001;
  return {
    lat: parseFloat((gf.latitude + jitterLat).toFixed(6)),
    lon: parseFloat((gf.longitude + jitterLon).toFixed(6)),
    geofence: gf,
  };
}

function generateBidRequest(geofences: Geofence[], useTargetMaid: boolean) {
  const isGeofence = Math.random() < 0.2; // 20% geofence-matching

  let location: { lat: number; lon: number };
  if (isGeofence) {
    location = randomGeofenceLocation(geofences);
  } else {
    location = randomUSLocation();
  }

  // 5% of geofence requests use a targeted MAID
  const maid = isGeofence && useTargetMaid && Math.random() < 0.05
    ? TARGET_MAIDS[Math.floor(Math.random() * TARGET_MAIDS.length)]
    : randomMaid();

  const os = Math.random() > 0.5 ? "Android" : "iOS";
  const osv = os === "Android" ? `${13 + Math.floor(Math.random() * 3)}.0` : `${16 + Math.floor(Math.random() * 3)}.0`;
  const make = os === "Android" ? "Google" : "Apple";
  const model = os === "Android" ? "Pixel 8" : "iPhone 15";

  return {
    id: randomUUID(),
    imp: [{
      id: "1",
      banner: { w: 320, h: 50 },
      bidfloor: 0.10,
      bidfloorcur: "USD",
    }],
    device: {
      ifa: maid,
      os,
      osv,
      make,
      model,
      geo: { lat: location.lat, lon: location.lon, type: 1 },
      ip: `${10 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      ua: "Mozilla/5.0",
    },
    app: { name: "TestApp", bundle: "com.test.app" },
    at: 2, // Second price auction
    tmax: 100,
    cur: ["USD"],
  };
}

// ── Benchmark execution ──────────────────────────────────────────────────

interface RequestResult {
  status: number;
  latencyMs: number;
  error?: string;
}

async function sendBidRequest(bid: any): Promise<RequestResult> {
  const start = performance.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bid),
    });
    const latencyMs = parseFloat((performance.now() - start).toFixed(2));
    return { status: res.status, latencyMs };
  } catch (err: any) {
    const latencyMs = parseFloat((performance.now() - start).toFixed(2));
    return { status: 0, latencyMs, error: err.message };
  }
}

async function runBenchmark() {
  console.log("═".repeat(60));
  console.log("  Software Build 1 — OpenRTB Bidstream Benchmark");
  console.log("═".repeat(60));
  console.log(`  Endpoint:  ${ENDPOINT}`);
  console.log(`  QPS:       ${QPS}`);
  console.log(`  Duration:  ${DURATION}s`);
  console.log("─".repeat(60));

  // Fetch geofences
  const geofences = await fetchGeofences();
  console.log(`  Geofences: ${geofences.length} loaded`);

  // Seed target MAIDs into Redis via the targeting API
  console.log(`  Target MAIDs: ${TARGET_MAIDS.length} (seeding...)`);
  try {
    await fetch("http://localhost:5001/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.SCANNER_PASSWORD || "LightEngine" }),
    }).then(r => r.headers.get("set-cookie")).then(async (cookies) => {
      await fetch("http://localhost:5001/api/geofence/targeting/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies || "" },
        body: JSON.stringify({ maids: TARGET_MAIDS }),
      });
    });
    console.log("  Target MAIDs seeded ✓");
  } catch {
    console.log("  Target MAIDs seeding skipped (auth failed)");
  }

  console.log("─".repeat(60));
  console.log("  Running benchmark...\n");

  const results: RequestResult[] = [];
  const intervalMs = 1000 / QPS;
  const totalRequests = QPS * DURATION;
  let sent = 0;

  // Use concurrent batches
  const batchSize = Math.min(QPS, 100);
  const startTime = performance.now();

  for (let batch = 0; batch < Math.ceil(totalRequests / batchSize); batch++) {
    const batchStart = batch * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, totalRequests);
    const batchPromises: Promise<RequestResult>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const bid = generateBidRequest(geofences, true);
      batchPromises.push(sendBidRequest(bid));
      sent++;
    }

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Progress bar
    const progress = Math.round((sent / totalRequests) * 100);
    const bar = "█".repeat(Math.floor(progress / 2)) + "░".repeat(50 - Math.floor(progress / 2));
    process.stdout.write(`\r  ${bar} ${progress}% (${sent}/${totalRequests})`);

    // Pace to maintain target QPS
    const elapsed = (performance.now() - startTime) / 1000;
    const expected = elapsed * QPS;
    if (sent < expected) {
      // We're behind, send next batch immediately
    } else {
      // We're ahead, wait
      await new Promise((r) => setTimeout(r, intervalMs * batchSize));
    }
  }

  const totalTime = (performance.now() - startTime) / 1000;
  console.log("\n");
  console.log("═".repeat(60));
  console.log("  RESULTS");
  console.log("═".repeat(60));

  // Count statuses
  const statusCounts: Record<number, number> = {};
  const latencies: number[] = [];
  let errors = 0;

  for (const r of results) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    latencies.push(r.latencyMs);
    if (r.error) errors++;
  }

  // Sort latencies for percentile calculation
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
  const actualQPS = (results.length / totalTime).toFixed(1);

  // ASCII summary table
  console.log("  ┌─────────────────────────────┬──────────────┐");
  console.log("  │ Metric                      │ Value        │");
  console.log("  ├─────────────────────────────┼──────────────┤");
  console.log(`  │ Total Requests Sent         │ ${String(sent).padEnd(12)} │`);
  console.log(`  │ HTTP 204 (No-Bid/Harvest)   │ ${String(statusCounts[204] || 0).padEnd(12)} │`);
  console.log(`  │ HTTP 200 (Bid Response)     │ ${String(statusCounts[200] || 0).padEnd(12)} │`);
  console.log(`  │ Errors / Timeouts           │ ${String(errors).padEnd(12)} │`);
  console.log(`  │ Actual QPS Achieved         │ ${actualQPS.padEnd(12)} │`);
  console.log("  ├─────────────────────────────┼──────────────┤");
  console.log(`  │ Avg Latency                 │ ${avgLatency.toFixed(2).padEnd(12)} │`);
  console.log(`  │ p50 Latency                 │ ${p50.toFixed(2).padEnd(12)} │`);
  console.log(`  │ p95 Latency                 │ ${p95.toFixed(2).padEnd(12)} │`);
  console.log(`  │ p99 Latency                 │ ${p99.toFixed(2).padEnd(12)} │`);
  console.log("  ├─────────────────────────────┼──────────────┤");
  console.log(`  │ Total Duration              │ ${totalTime.toFixed(1).padEnd(12)} │`);
  console.log(`  │ Geofences Active            │ ${String(geofences.length).padEnd(12)} │`);
  console.log(`  │ Target MAIDs Seeded         │ ${String(TARGET_MAIDS.length).padEnd(12)} │`);
  console.log("  └─────────────────────────────┴──────────────┘");
  console.log("");

  // Status breakdown
  console.log("  Status Code Breakdown:");
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    const pct = ((parseInt(status) / results.length) * 100).toFixed(1);
    console.log(`    HTTP ${status}: ${count} (${pct}%)`);
  }
  console.log("");
  console.log("═".repeat(60));
}

runBenchmark().catch(console.error);
