BEGIN;

ALTER TABLE keywords_snapshots
  ADD COLUMN IF NOT EXISTS actual_data_start DATE,
  ADD COLUMN IF NOT EXISTS actual_data_end DATE;

ALTER TABLE category_performance_snapshots
  ADD COLUMN IF NOT EXISTS actual_data_start DATE,
  ADD COLUMN IF NOT EXISTS actual_data_end DATE;

ALTER TABLE product_performance_snapshots
  ADD COLUMN IF NOT EXISTS actual_data_start DATE,
  ADD COLUMN IF NOT EXISTS actual_data_end DATE;

ALTER TABLE auction_insights_snapshots
  ADD COLUMN IF NOT EXISTS actual_data_start DATE,
  ADD COLUMN IF NOT EXISTS actual_data_end DATE;

ALTER TABLE product_coverage_snapshots
  ADD COLUMN IF NOT EXISTS actual_data_start DATE,
  ADD COLUMN IF NOT EXISTS actual_data_end DATE;

COMMENT ON COLUMN keywords_snapshots.actual_data_start IS 'Actual earliest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';
COMMENT ON COLUMN keywords_snapshots.actual_data_end IS 'Actual latest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';

COMMENT ON COLUMN category_performance_snapshots.actual_data_start IS 'Actual earliest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';
COMMENT ON COLUMN category_performance_snapshots.actual_data_end IS 'Actual latest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';

COMMENT ON COLUMN product_performance_snapshots.actual_data_start IS 'Actual earliest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';
COMMENT ON COLUMN product_performance_snapshots.actual_data_end IS 'Actual latest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';

COMMENT ON COLUMN auction_insights_snapshots.actual_data_start IS 'Actual earliest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';
COMMENT ON COLUMN auction_insights_snapshots.actual_data_end IS 'Actual latest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';

COMMENT ON COLUMN product_coverage_snapshots.actual_data_start IS 'Actual earliest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';
COMMENT ON COLUMN product_coverage_snapshots.actual_data_end IS 'Actual latest insight_date present in the source data for this snapshot. NULL for snapshots generated before this column was added.';

COMMIT;
