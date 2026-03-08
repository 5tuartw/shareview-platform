-- Migration: 20260308010000_add_market_profile_fields_to_retailers_up
-- Adds market profile workflow fields to retailers for admin profiling UI.

BEGIN;

ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS profile_status VARCHAR(40) DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS profile_assignment_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS profile_domains JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS profile_confirmed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS profile_last_ai_at TIMESTAMP;

UPDATE retailers
SET
  profile_status = COALESCE(profile_status, 'unassigned'),
  profile_domains = COALESCE(profile_domains, '{}'::jsonb)
WHERE profile_status IS NULL OR profile_domains IS NULL;

ALTER TABLE retailers
  ALTER COLUMN profile_status SET DEFAULT 'unassigned',
  ALTER COLUMN profile_domains SET DEFAULT '{}'::jsonb,
  ALTER COLUMN profile_domains SET NOT NULL;

ALTER TABLE retailers
  DROP CONSTRAINT IF EXISTS retailers_profile_status_check;

ALTER TABLE retailers
  ADD CONSTRAINT retailers_profile_status_check
  CHECK (profile_status IN ('unassigned', 'pending_confirmation', 'confirmed'));

ALTER TABLE retailers
  DROP CONSTRAINT IF EXISTS retailers_profile_assignment_mode_check;

ALTER TABLE retailers
  ADD CONSTRAINT retailers_profile_assignment_mode_check
  CHECK (profile_assignment_mode IS NULL OR profile_assignment_mode IN ('manual', 'ai'));

CREATE INDEX IF NOT EXISTS idx_retailers_profile_status
  ON retailers (profile_status);

CREATE INDEX IF NOT EXISTS idx_retailers_profile_last_ai_at
  ON retailers (profile_last_ai_at)
  WHERE profile_last_ai_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retailers_profile_domains
  ON retailers USING GIN (profile_domains);

INSERT INTO schema_migrations (version, description, applied_at)
VALUES (
  '20260308010000',
  'Add market profile status and domain assignment fields to retailers',
  NOW()
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
