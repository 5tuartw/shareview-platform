-- Migration: Add finalised_at to snapshot tables
-- Once a month's range_end is older than SOURCE_ATTRIBUTION_WINDOW_DAYS (60 days),
-- the source will never update it again. We mark it finalised so subsequent pipeline
-- runs can skip it without even querying the source.
-- keywords_snapshots is the gating table used by identifyMonthsToProcess;
-- the other tables are marked for completeness and future health display.

BEGIN;

ALTER TABLE keywords_snapshots
  ADD COLUMN finalised_at TIMESTAMPTZ;
COMMENT ON COLUMN keywords_snapshots.finalised_at IS
  'Set when range_end is older than the source attribution window (60 days). '
  'Pipeline skips this month on future runs as the source will never update it again.';

ALTER TABLE category_snapshot_periods
  ADD COLUMN finalised_at TIMESTAMPTZ;
COMMENT ON COLUMN category_snapshot_periods.finalised_at IS
  'Set when range_end is beyond the 60-day source attribution window.';

ALTER TABLE product_performance_snapshots
  ADD COLUMN finalised_at TIMESTAMPTZ;
COMMENT ON COLUMN product_performance_snapshots.finalised_at IS
  'Set when range_end is beyond the 60-day source attribution window.';

ALTER TABLE auction_insights_snapshots
  ADD COLUMN finalised_at TIMESTAMPTZ;
COMMENT ON COLUMN auction_insights_snapshots.finalised_at IS
  'Set when range_end is beyond the 60-day source attribution window.';

COMMIT;
