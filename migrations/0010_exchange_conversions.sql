-- 0010_exchange_conversions.sql
-- Exchange partners + S2S conversion tracking tables

-- Exchange partners (SSPs that send us bid requests)
CREATE TABLE IF NOT EXISTS "exchange_partners" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "endpoint" text,
  "bid_endpoint" text,
  "api_key" text NOT NULL,
  "status" text DEFAULT 'pending',
  "bid_requests_received" integer DEFAULT 0,
  "last_bid_request" timestamp,
  "notes" text,
  "created_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "exchange_partner_key_idx" ON "exchange_partners" ("api_key");
CREATE INDEX IF NOT EXISTS "exchange_partner_status_idx" ON "exchange_partners" ("status");

-- S2S conversion tracking
CREATE TABLE IF NOT EXISTS "conversions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tracking_id" text,        -- the tid / auction bid ID from the original bid
  "creative_id" varchar REFERENCES "creatives"("id") ON DELETE SET NULL,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "event_id" integer,
  "conversion_value" numeric DEFAULT 0,
  "geofence_id" varchar,
  "maid" text,
  "ip" text,
  "user_agent" text,
  "recorded_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "conv_tracking_idx" ON "conversions" ("tracking_id");
CREATE INDEX IF NOT EXISTS "conv_campaign_idx" ON "conversions" ("campaign_id");
CREATE INDEX IF NOT EXISTS "conv_creative_idx" ON "conversions" ("creative_id");
CREATE INDEX IF NOT EXISTS "conv_recorded_idx" ON "conversions" ("recorded_at" DESC);

-- Bidder weights — auto-optimization based on conversion data
CREATE TABLE IF NOT EXISTS "bidder_weights" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tracking_id" text UNIQUE,
  "creative_id" varchar REFERENCES "creatives"("id") ON DELETE SET NULL,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "geofence_id" varchar,
  "conversion_score" numeric DEFAULT 0,
  "bid_multiplier" numeric DEFAULT 1.0,
  "updated_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "bw_tracking_idx" ON "bidder_weights" ("tracking_id");
CREATE INDEX IF NOT EXISTS "bw_campaign_idx" ON "bidder_weights" ("campaign_id");
