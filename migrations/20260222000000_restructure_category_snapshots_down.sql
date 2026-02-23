-- Rollback: Restore original category_performance_snapshots structure
-- This recreates the summary-based table structure

DROP TABLE IF EXISTS category_performance_snapshots CASCADE;

-- Restore original structure (from 20260216000000_create_snapshot_tables_up.sql)
CREATE TABLE category_performance_snapshots (
  id SERIAL PRIMARY KEY,
  retailer_id VARCHAR(50) NOT NULL,
  range_type VARCHAR(20) NOT NULL,
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Summary metrics (old structure)
  total_categories INTEGER,
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_conversions NUMERIC(10,2),
  overall_ctr NUMERIC(10,4),
  overall_cvr NUMERIC(10,4),
  
  -- Health counts
  health_broken_count INTEGER,
  health_underperforming_count INTEGER,
  health_attention_count INTEGER,
  health_healthy_count INTEGER,
  health_star_count INTEGER,
  
  -- JSONB fields
  categories JSONB,
  health_summary JSONB,
  
  classified_at TIMESTAMP
);

-- Restore original indexes
CREATE INDEX idx_category_snapshots_retailer 
  ON category_performance_snapshots(retailer_id);

CREATE INDEX idx_category_snapshots_dates 
  ON category_performance_snapshots(range_start, range_end);

CREATE INDEX idx_category_snapshots_retailer_dates 
  ON category_performance_snapshots(retailer_id, range_start, range_end);

CREATE INDEX idx_category_snapshots_range_type 
  ON category_performance_snapshots(range_type);

-- Restore unique constraint
CREATE UNIQUE INDEX uq_category_snapshot_range 
  ON category_performance_snapshots(retailer_id, range_type, range_start, range_end);

-- Restore check constraints
ALTER TABLE category_performance_snapshots 
  ADD CONSTRAINT chk_category_date_range CHECK (range_end >= range_start);

ALTER TABLE category_performance_snapshots 
  ADD CONSTRAINT category_performance_snapshots_range_type_check 
  CHECK (range_type IN ('month', 'week', 'custom'));
