BEGIN;

ALTER TABLE keywords_snapshots
  DROP COLUMN IF EXISTS actual_data_start,
  DROP COLUMN IF EXISTS actual_data_end;

ALTER TABLE category_performance_snapshots
  DROP COLUMN IF EXISTS actual_data_start,
  DROP COLUMN IF EXISTS actual_data_end;

ALTER TABLE product_performance_snapshots
  DROP COLUMN IF EXISTS actual_data_start,
  DROP COLUMN IF EXISTS actual_data_end;

ALTER TABLE auction_insights_snapshots
  DROP COLUMN IF EXISTS actual_data_start,
  DROP COLUMN IF EXISTS actual_data_end;

ALTER TABLE product_coverage_snapshots
  DROP COLUMN IF EXISTS actual_data_start,
  DROP COLUMN IF EXISTS actual_data_end;

COMMIT;
