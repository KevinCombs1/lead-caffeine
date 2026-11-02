-- ── Layer 1: Geofencing Platform (PostGIS) ──────────────────────────────
-- Tables: geofences, captured_devices, audience_segments
-- Requires: PostGIS extension (already enabled on PG18)

-- ── geofences ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "geofences" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text,
  "company_id" varchar REFERENCES "supreme_companies"("id"),
  "job_id" varchar,
  "latitude" real NOT NULL,
  "longitude" real NOT NULL,
  "radius_m" real NOT NULL DEFAULT 250,
  "active" boolean NOT NULL DEFAULT true,
  "address" text,
  "city" text,
  "state" text,
  "zip" text,
  "source" text,
  "tags" text[] DEFAULT '{}'::text[],
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- PostGIS geometry column: Polygon in WGS84 (SRID 4326)
SELECT AddGeometryColumn('geofences', 'geom', 4326, 'POLYGON', 2);

-- GIST spatial index for fast ST_Contains / ST_Intersects queries
CREATE INDEX IF NOT EXISTS "geofence_geom_gist" ON "geofences" USING GIST ("geom");

CREATE INDEX IF NOT EXISTS "geofence_active_idx" ON "geofences" ("active");
CREATE INDEX IF NOT EXISTS "geofence_job_idx" ON "geofences" ("job_id");
CREATE INDEX IF NOT EXISTS "geofence_company_idx" ON "geofences" ("company_id");

-- Trigger to auto-update geom when latitude/longitude/radius_m changes
CREATE OR REPLACE FUNCTION update_geofence_geom()
RETURNS TRIGGER AS $$
BEGIN
  -- Convert lat/lng to a PostGIS point (SRID 4326)
  -- Transform to a metric projection (3857 — Web Mercator) for accurate buffering
  -- Buffer by radius_m, then transform back to 4326
  NEW.geom := ST_Transform(
    ST_Buffer(
      ST_Transform(
        ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326),
        3857
      ),
      NEW.radius_m
    ),
    4326
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER geofence_geom_trigger
  BEFORE INSERT OR UPDATE OF latitude, longitude, radius_m ON "geofences"
  FOR EACH ROW EXECUTE FUNCTION update_geofence_geom();

-- ── captured_devices ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "captured_devices" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "maid" text,
  "device_type" text,
  "os" text,
  "osv" text,
  "make" text,
  "model" text,
  "carrier" text,
  "latitude" real,
  "longitude" real,
  "geofence_id" varchar REFERENCES "geofences"("id"),
  "geofence_name" text,
  "ip" text,
  "ua" text,
  "synced" boolean NOT NULL DEFAULT false,
  "synced_at" timestamp,
  "synced_to" text,
  "first_seen" timestamp DEFAULT now(),
  "last_seen" timestamp DEFAULT now(),
  "hit_count" integer NOT NULL DEFAULT 1,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "captured_dev_maid_idx" ON "captured_devices" ("maid");
CREATE INDEX IF NOT EXISTS "captured_dev_geofence_idx" ON "captured_devices" ("geofence_id");
CREATE INDEX IF NOT EXISTS "captured_dev_synced_idx" ON "captured_devices" ("synced");
CREATE INDEX IF NOT EXISTS "captured_dev_seen_idx" ON "captured_devices" ("last_seen");

-- ── audience_segments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audience_segments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "geofence_ids" text[] DEFAULT '{}'::text[],
  "ttd_segment_id" text,
  "stackadapt_audience_id" text,
  "beeswax_segment_id" text,
  "adpersonam_location_ids" text[] DEFAULT '{}'::text[],
  "device_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audience_seg_status_idx" ON "audience_segments" ("status");
