-- ── Campaign Builder ───────────────────────────────────────────────────
-- Tables: campaigns, creatives, campaign_geofences
-- Depends on: geofences (from 0007_geofence_platform.sql)

-- ── campaigns ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "bid_price_cpm" real NOT NULL DEFAULT 0.50,
  "daily_budget" real,
  "total_budget" real,
  "total_spent" real NOT NULL DEFAULT 0,
  "total_impressions" integer NOT NULL DEFAULT 0,
  "total_clicks" integer NOT NULL DEFAULT 0,
  "total_wins" integer NOT NULL DEFAULT 0,
  "start_date" timestamp,
  "end_date" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "campaign_status_idx" ON "campaigns" ("status");

-- ── creatives ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "creatives" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" varchar NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "file_path" text NOT NULL,
  "file_size" integer,
  "mime_type" text,
  "width" integer,
  "height" integer,
  "duration" real,
  "click_url" text,
  "headline" text,
  "description" text,
  "cta_text" text,
  "display_url" text,
  "icon_path" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "creative_campaign_idx" ON "creatives" ("campaign_id");

-- ── campaign_geofences (join table) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaign_geofences" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" varchar NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "geofence_id" varchar NOT NULL REFERENCES "geofences"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_geofence_unique_idx"
  ON "campaign_geofences" ("campaign_id", "geofence_id");
CREATE INDEX IF NOT EXISTS "cg_campaign_idx" ON "campaign_geofences" ("campaign_id");
CREATE INDEX IF NOT EXISTS "cg_geofence_idx" ON "campaign_geofences" ("geofence_id");

-- Trigger to auto-update campaigns.updated_at
CREATE OR REPLACE FUNCTION update_campaign_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaign_timestamp_trigger ON "campaigns";
CREATE TRIGGER campaign_timestamp_trigger
  BEFORE UPDATE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION update_campaign_timestamp();
