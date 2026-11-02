#!/bin/bash
# ── Lead Caffeine Production Init ────────────────────────────────────────
# Run this after first deploy to set up database schema and ClickHouse tables.
#
# Usage:
#   ./scripts/init-production.sh
#
# Prerequisites:
#   - DATABASE_URL env var is set
#   - CLICKHOUSE_URL and CLICKHOUSE_PASSWORD env vars are set
#   - psql and curl are available (Render shell has both)

set -e

echo "══════════════════════════════════════════════════════════"
echo "  Lead Caffeine — Production Database Init"
echo "══════════════════════════════════════════════════════════"

# ── PostgreSQL: Enable PostGIS + run migrations ──────────────────────────
echo ""
echo "[1/4] Enabling PostGIS extension..."
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
echo "  ✓ PostGIS enabled"

echo "[2/4] Running Supreme migration..."
psql "$DATABASE_URL" -f migrations/0006_supreme.sql
echo "  ✓ Supreme tables created"

echo "[3/4] Running Geofence platform migration..."
psql "$DATABASE_URL" -f migrations/0007_geofence_platform.sql
echo "  ✓ Geofence tables created (with PostGIS geometry + GIST index)"

# ── ClickHouse: Create analytics tables ──────────────────────────────────
echo "[4/4] Creating ClickHouse tables..."
CH_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
CH_AUTH="${CLICKHOUSE_USER:-default}:${CLICKHOUSE_PASSWORD}"

curl -s "$CH_URL" -u "$CH_AUTH" --data-binary "
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
PARTITION BY toYYYYMM(captured_at);
"
echo "  ✓ device_captures table created"

curl -s "$CH_URL" -u "$CH_AUTH" --data-binary "
CREATE TABLE IF NOT EXISTS bid_wins (
  maid String,
  geofence_id String,
  price Float64,
  won_at DateTime
) ENGINE = MergeTree()
ORDER BY won_at;
"
echo "  ✓ bid_wins table created"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ✓ Database initialization complete!"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Log in at https://leadcaffeine.com"
echo "  2. Go to Supreme → Generate geofences from Line 2 data"
echo "  3. Go to Geofence → Dashboard to verify pipeline"
echo "  4. Add target MAIDs in DSP Sync tab"
echo "  5. Register https://leadcaffeine.com/api/openrtb/auction with an exchange"
