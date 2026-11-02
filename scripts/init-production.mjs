/**
 * Lead Caffeine — Production Database Init (Node.js version)
 * 
 * Run from the Render shell:  node scripts/init-production.mjs
 * 
 * Prerequisites:
 *   - DATABASE_URL env var is set
 *   - CLICKHOUSE_URL and CLICKHOUSE_PASSWORD env vars are set
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
const CH_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
const CH_USER = process.env.CLICKHOUSE_USER || 'default';
const CH_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Set it in the Environment tab first.');
  process.exit(1);
}

console.log('══════════════════════════════════════════════════════════');
console.log('  Lead Caffeine — Production Database Init');
console.log('══════════════════════════════════════════════════════════');

// ── PostgreSQL: Enable PostGIS + run migrations ──────────────────────────
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function runSqlFile(filepath, label) {
  const sql = fs.readFileSync(filepath, 'utf8');
  await pool.query(sql);
  console.log(`  ✓ ${label}`);
}

async function initPostgres() {
  console.log('\n[1/4] Enabling PostGIS extension...');
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  console.log('  ✓ PostGIS enabled');

  console.log('[2/5] Running Supreme migration...');
  await runSqlFile(path.join(__dirname, '..', 'migrations', '0006_supreme.sql'), 'Supreme tables created');

  console.log('[3/5] Running Geofence platform migration...');
  await runSqlFile(path.join(__dirname, '..', 'migrations', '0007_geofence_platform.sql'), 'Geofence tables created (with PostGIS geometry + GIST index)');

  console.log('[4/5] Running Campaign Builder migration...');
  await runSqlFile(path.join(__dirname, '..', 'migrations', '0008_campaign_builder.sql'), 'Campaign, creative, and campaign_geofences tables created');
}

// ── ClickHouse: Create analytics tables ──────────────────────────────────
async function initClickHouse() {
  console.log('[5/5] Creating ClickHouse tables...');

  const authHeader = 'Basic ' + Buffer.from(`${CH_USER}:${CH_PASSWORD}`).toString('base64');

  const deviceCapturesSQL = `
CREATE TABLE IF NOT EXISTS device_captures (
  id String,
  maid String,
  device_type String,
  os String,
  osv String,
  make String,
  model String,
  latitude Float64,
  longitude Float64,
  geofence_id String,
  geofence_name String,
  ip String,
  ua String,
  hit_count UInt32,
  captured_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (captured_at, geofence_id)
PARTITION BY toYYYYMM(captured_at);`;

  const bidWinsSQL = `
CREATE TABLE IF NOT EXISTS bid_wins (
  maid String,
  geofence_id String,
  price Float64,
  won_at DateTime
) ENGINE = MergeTree()
ORDER BY won_at;`;

  const resp1 = await fetch(`${CH_URL}/?query=${encodeURIComponent(deviceCapturesSQL)}`, {
    method: 'POST',
    headers: { 'Authorization': authHeader }
  });
  if (!resp1.ok) {
    const text = await resp1.text();
    throw new Error(`ClickHouse device_captures failed: ${resp1.status} ${text}`);
  }
  console.log('  ✓ device_captures table created');

  const resp2 = await fetch(`${CH_URL}/?query=${encodeURIComponent(bidWinsSQL)}`, {
    method: 'POST',
    headers: { 'Authorization': authHeader }
  });
  if (!resp2.ok) {
    const text = await resp2.text();
    throw new Error(`ClickHouse bid_wins failed: ${resp2.status} ${text}`);
  }
  console.log('  ✓ bid_wins table created');
}

// ── Main ──────────────────────────────────────────────────────────────────
try {
  await initPostgres();
  await initClickHouse();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ✓ Database initialization complete!');
  console.log('══════════════════════════════════════════════════════════');
  console.log('\nNext steps:');
  console.log('  1. Log in at https://leadcaffeine.com');
  console.log('  2. Go to Supreme → Generate geofences from Line 2 data');
  console.log('  3. Go to Geofence → Dashboard to verify pipeline');
  console.log('  4. Add target MAIDs in DSP Sync tab');
  console.log('  5. Register https://leadcaffeine.com/api/openrtb/auction with an exchange');
} catch (err) {
  console.error('\n❌ Initialization failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
