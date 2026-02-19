-- Migration Version: 20260220000000
-- Description: Rollback reports and report_domains tables

BEGIN;

DROP TABLE IF EXISTS report_domains;
DROP TABLE IF EXISTS reports;

COMMIT;
