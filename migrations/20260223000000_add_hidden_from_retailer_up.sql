BEGIN;

ALTER TABLE reports ADD COLUMN hidden_from_retailer BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_reports_hidden ON reports(hidden_from_retailer);

COMMIT;
