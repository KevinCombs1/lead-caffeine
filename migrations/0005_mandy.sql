-- Mandy profiles table
CREATE TABLE IF NOT EXISTS mandy_profiles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  profile_url TEXT NOT NULL UNIQUE,
  profile_type TEXT,
  name TEXT,
  gender TEXT,
  location TEXT,
  bio TEXT,
  height TEXT,
  weight TEXT,
  build TEXT,
  hair TEXT,
  eyes TEXT,
  chest_size TEXT,
  waist_size TEXT,
  hips_size TEXT,
  dress_size TEXT,
  playing_age TEXT,
  ethnicities TEXT,
  credits JSONB,
  skills TEXT,
  education TEXT,
  highlights TEXT,
  websites TEXT,
  imdb_url TEXT,
  social_links TEXT,
  representation TEXT,
  union_membership TEXT,
  has_drivers_license BOOLEAN,
  has_passport BOOLEAN,
  phone TEXT,
  email TEXT,
  website TEXT,
  calendly_url TEXT,
  calcom_url TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scraped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mandy_username_idx ON mandy_profiles(username);
CREATE INDEX IF NOT EXISTS mandy_name_idx ON mandy_profiles(name);
CREATE INDEX IF NOT EXISTS mandy_location_idx ON mandy_profiles(location);
CREATE INDEX IF NOT EXISTS mandy_status_idx ON mandy_profiles(status);
CREATE INDEX IF NOT EXISTS mandy_type_idx ON mandy_profiles(profile_type);
CREATE INDEX IF NOT EXISTS mandy_phone_idx ON mandy_profiles(phone);
CREATE INDEX IF NOT EXISTS mandy_email_idx ON mandy_profiles(email);

-- Mandy jobs table
CREATE TABLE IF NOT EXISTS mandy_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  total_profiles INTEGER NOT NULL DEFAULT 0,
  discovered_profiles INTEGER NOT NULL DEFAULT 0,
  enriched_profiles INTEGER NOT NULL DEFAULT 0,
  should_stop BOOLEAN NOT NULL DEFAULT false,
  log TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mandy_job_status_idx ON mandy_jobs(status);
