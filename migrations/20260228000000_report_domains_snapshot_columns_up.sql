-- Migration Version: 20260228000000
-- Description: Add frozen snapshot storage columns to report_domains so reports always
--              show data as it was at creation time, not the latest live snapshot.

BEGIN;

ALTER TABLE report_domains
  ADD COLUMN IF NOT EXISTS performance_table  JSONB,
  ADD COLUMN IF NOT EXISTS domain_metrics_data JSONB;

COMMIT;
