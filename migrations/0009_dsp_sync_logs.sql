-- 0009_dsp_sync_logs.sql
-- Create dsp_sync_logs table for DSP sync history tracking

CREATE TABLE IF NOT EXISTS "dsp_sync_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "segment_id" text,
  "segment_name" text,
  "total_maids" integer DEFAULT 0,
  "uploaded" integer DEFAULT 0,
  "success" boolean DEFAULT false,
  "duration_ms" integer DEFAULT 0,
  "error" text,
  "created_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "dsp_logs_provider_idx" ON "dsp_sync_logs" ("provider");
CREATE INDEX IF NOT EXISTS "dsp_logs_created_idx" ON "dsp_sync_logs" ("created_at" DESC);
