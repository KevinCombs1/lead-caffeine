-- Stage 32 profile harvester tables
CREATE TABLE IF NOT EXISTS stage32_profiles (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  stage32_id integer,
  stage32_slug text,
  stage32_url text NOT NULL UNIQUE,
  name text,
  first_name text,
  last_name text,
  bio text,
  location text,
  profession text,
  company text,
  profile_image_url text,
  twitter text,
  instagram text,
  youtube text,
  facebook text,
  linkedin text,
  website text,
  bio_phone text,
  bio_email text,
  bio_calendly_url text,
  website_phone text,
  website_email text,
  website_calendly_url text,
  imdb_id text,
  guild text,
  projects text,
  is_service_provider boolean NOT NULL DEFAULT false,
  is_executive boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  scraped_at timestamp,
  website_checked_at timestamp,
  created_at timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS s32_id_idx ON stage32_profiles (stage32_id);
CREATE INDEX IF NOT EXISTS s32_slug_idx ON stage32_profiles (stage32_slug);
CREATE INDEX IF NOT EXISTS s32_name_idx ON stage32_profiles (name);
CREATE INDEX IF NOT EXISTS s32_location_idx ON stage32_profiles (location);
CREATE INDEX IF NOT EXISTS s32_status_idx ON stage32_profiles (status);
CREATE INDEX IF NOT EXISTS s32_email_idx ON stage32_profiles (website_email);
CREATE INDEX IF NOT EXISTS s32_phone_idx ON stage32_profiles (website_phone);

CREATE TABLE IF NOT EXISTS stage32_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  start_id integer NOT NULL DEFAULT 1,
  end_id integer NOT NULL DEFAULT 1500000,
  workers_scraped integer NOT NULL DEFAULT 0,
  websites_checked integer NOT NULL DEFAULT 0,
  contact_found integer NOT NULL DEFAULT 0,
  should_stop boolean NOT NULL DEFAULT false,
  log text,
  started_at timestamp DEFAULT NOW(),
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS s32_job_status_idx ON stage32_jobs (status);
