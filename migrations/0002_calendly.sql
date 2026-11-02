-- Calendly Compass — Calendly Intelligence System

-- Add platform column to existing compass tables
ALTER TABLE "compass_sources" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'cal.com';
ALTER TABLE "compass_discoveries" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'cal.com';
ALTER TABLE "compass_profiles" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'cal.com';
ALTER TABLE "compass_query_jobs" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'cal.com';

-- Add platform index to discoveries and profiles for filtering
CREATE INDEX IF NOT EXISTS "cd_platform_idx" ON "compass_discoveries" ("platform");
CREATE INDEX IF NOT EXISTS "cp_platform_idx" ON "compass_profiles" ("platform");

-- Seed Calendly sources
INSERT INTO "compass_sources" ("name", "scraper_key", "enabled", "status", "platform", "rate_limit_ms", "max_concurrent", "description") VALUES
('Serper External Dork', 'calendly_serper_dork', true, 'working', 'calendly', 2000, 2, 'Google dorking for calendly.com links on external sites (LinkedIn, Twitter, personal websites)'),
('GitHub Code Search', 'calendly_github_search', true, 'working', 'calendly', 3000, 1, 'GitHub search for repos embedding calendly.com URLs in code'),
('Wayback CDX Scan', 'calendly_wayback_cdx', true, 'working', 'calendly', 2000, 1, 'Wayback Machine CDX API for historical Calendly profile URLs'),
('BFF Slug Validation', 'calendly_bff_slug', true, 'working', 'calendly', 1000, 2, 'Validate candidate slugs against Calendly BFF API (/api/booking/profiles/{slug})'),
('Name Permutation', 'calendly_name_perm', true, 'working', 'calendly', 1000, 1, 'Generate candidate slugs from name patterns and validate via BFF'),
('Email Handle', 'calendly_email_handle', true, 'working', 'calendly', 1000, 1, 'Extract Calendly slugs from email handles and validate via BFF')
ON CONFLICT ("scraper_key") DO NOTHING;
