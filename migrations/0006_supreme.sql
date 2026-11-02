-- Parallel Supreme engine: geofence advertising pipeline
-- Line 1: keyword-indexed company discovery (city/state + keywords → companies)
-- Line 2: address geocoding & coordinate pinning (websites → lat/lng + radius)

-- Supreme jobs table
CREATE TABLE IF NOT EXISTS supreme_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  line TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_combos INTEGER NOT NULL DEFAULT 0,
  completed_combos INTEGER NOT NULL DEFAULT 0,
  companies_found INTEGER NOT NULL DEFAULT 0,
  total_websites INTEGER NOT NULL DEFAULT 0,
  geocoded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  should_stop BOOLEAN NOT NULL DEFAULT false,
  log TEXT[] DEFAULT '{}'::text[],
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS supreme_job_status_idx ON supreme_jobs(status);
CREATE INDEX IF NOT EXISTS supreme_job_line_idx ON supreme_jobs(line);

-- Supreme companies table
CREATE TABLE IF NOT EXISTS supreme_companies (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL,
  line TEXT NOT NULL,
  name TEXT,
  website TEXT,
  normalized_url TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'US',
  category TEXT,
  source TEXT,
  source_url TEXT,
  latitude REAL,
  longitude REAL,
  geocode_source TEXT,
  geocode_confidence INTEGER,
  radius_yards INTEGER,
  radius_miles REAL,
  radius_km REAL,
  meta_radius_miles REAL,
  pin_query TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supreme_comp_job_idx ON supreme_companies(job_id);
CREATE INDEX IF NOT EXISTS supreme_comp_line_idx ON supreme_companies(line);
CREATE INDEX IF NOT EXISTS supreme_comp_status_idx ON supreme_companies(status);
CREATE INDEX IF NOT EXISTS supreme_comp_norm_idx ON supreme_companies(normalized_url);
CREATE INDEX IF NOT EXISTS supreme_comp_geo_idx ON supreme_companies(latitude, longitude);
