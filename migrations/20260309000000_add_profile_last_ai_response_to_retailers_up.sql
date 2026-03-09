-- Migration: 20260309000000_add_profile_last_ai_response_to_retailers_up

BEGIN;

ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS profile_last_ai_response JSONB,
  ADD COLUMN IF NOT EXISTS profile_last_ai_model VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_retailers_profile_last_ai_model
  ON retailers (profile_last_ai_model)
  WHERE profile_last_ai_model IS NOT NULL;

INSERT INTO schema_migrations (version, description, applied_at)
VALUES (
  '20260309000000',
  'Add stored AI response payload fields for market profile assignments',
  NOW()
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
