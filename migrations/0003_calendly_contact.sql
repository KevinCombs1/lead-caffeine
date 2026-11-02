-- Add phone, email, website columns to compass_profiles
ALTER TABLE compass_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE compass_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE compass_profiles ADD COLUMN IF NOT EXISTS website text;

-- Add indexes for phone and email filtering
CREATE INDEX IF NOT EXISTS cp_phone_idx ON compass_profiles (phone);
CREATE INDEX IF NOT EXISTS cp_email_idx ON compass_profiles (email);
