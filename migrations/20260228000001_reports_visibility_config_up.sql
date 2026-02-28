-- Migration Version: 20260228000001
-- Description: Add visibility_config to reports table so the retailer's tab/section/feature
--              settings are frozen at report-creation time and the report viewer always
--              shows the same layout as when the report was made.

BEGIN;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS visibility_config JSONB;

COMMIT;
