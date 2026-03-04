-- Migration: 20260305000000_add_is_demo_to_retailers_up

BEGIN;

ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN retailers.is_demo IS 'True means this retailer is frozen in demo mode: snapshot scheduler skips it and post-freeze snapshot rows are removed.';

UPDATE retailers
SET is_demo = true
WHERE retailer_id = 'demo';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260305000000', 'Add is_demo flag to retailers', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
