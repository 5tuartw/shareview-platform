BEGIN;

DROP INDEX IF EXISTS idx_reports_hidden;
ALTER TABLE reports DROP COLUMN IF EXISTS hidden_from_retailer;

COMMIT;
