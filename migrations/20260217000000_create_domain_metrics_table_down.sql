-- Migration Version: 20260217000000
-- Description: Drop domain_metrics table
-- Dependencies: None

BEGIN;

DROP TABLE IF EXISTS domain_metrics CASCADE;

COMMIT;
