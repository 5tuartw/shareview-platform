-- Migration: 20260308000000_add_data_activity_fields_to_retailers_up

BEGIN;

ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS data_activity_status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS last_data_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'retailers_data_activity_status_check'
  ) THEN
    ALTER TABLE retailers
      ADD CONSTRAINT retailers_data_activity_status_check
      CHECK (data_activity_status IN ('active', 'inactive'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_retailers_data_activity_status
  ON retailers (data_activity_status);

CREATE INDEX IF NOT EXISTS idx_retailers_last_data_date
  ON retailers (last_data_date);

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260308000000', 'Add data activity fields to retailers', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
