-- Migration: Restructure category_performance_snapshots for tree navigation
-- Changes the table from summary-only to individual category rows with tree structure
-- Supports both node-only metrics and branch-aggregated metrics

-- Drop existing table (data is NULL/incomplete anyway)
DROP TABLE IF EXISTS category_performance_snapshots CASCADE;

-- Create new tree-structured category snapshots table
CREATE TABLE category_performance_snapshots (
  id SERIAL PRIMARY KEY,
  
  -- Retailer & time range
  retailer_id VARCHAR(50) NOT NULL,
  range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Category path (for filtering and tree navigation)
  category_level1 TEXT NOT NULL,
  category_level2 TEXT DEFAULT '',
  category_level3 TEXT DEFAULT '',
  category_level4 TEXT DEFAULT '',
  category_level5 TEXT DEFAULT '',
  
  -- Tree metadata
  full_path TEXT NOT NULL,              -- "beauty & skincare > makeup > face > foundation"
  depth INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 5),
  parent_path TEXT,                     -- "beauty & skincare > makeup > face" (NULL for level 1)
  
  -- Node-only metrics (products in THIS category, excluding children)
  node_impressions BIGINT DEFAULT 0,
  node_clicks BIGINT DEFAULT 0,
  node_conversions NUMERIC(10,2) DEFAULT 0,
  node_ctr NUMERIC(10,4),               -- Calculated: node_clicks / node_impressions
  node_cvr NUMERIC(10,4),               -- Calculated: node_conversions / node_clicks
  
  -- Branch metrics (this category + all descendants)
  branch_impressions BIGINT DEFAULT 0,
  branch_clicks BIGINT DEFAULT 0,
  branch_conversions NUMERIC(10,2) DEFAULT 0,
  branch_ctr NUMERIC(10,4),             -- Calculated: branch_clicks / branch_impressions
  branch_cvr NUMERIC(10,4),             -- Calculated: branch_conversions / branch_clicks
  
  -- Tree navigation helpers
  has_children BOOLEAN DEFAULT FALSE,
  child_count INTEGER DEFAULT 0,        -- Direct children count
  
  -- Performance classification (based on branch metrics for consistency)
  health_status VARCHAR(20),            -- 'star', 'healthy', 'attention', 'underperforming', 'broken'
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  classified_at TIMESTAMP
);

-- Indexes for efficient querying

-- Primary lookup by retailer and date range
CREATE INDEX idx_cat_snap_retailer_range 
  ON category_performance_snapshots(retailer_id, range_type, range_start, range_end);

-- Tree navigation by path levels (for drilling down)
CREATE INDEX idx_cat_snap_path_levels 
  ON category_performance_snapshots(retailer_id, range_start, category_level1, category_level2, category_level3);

-- Full path lookup (for direct navigation)
CREATE INDEX idx_cat_snap_full_path 
  ON category_performance_snapshots(retailer_id, full_path, range_start);

-- Parent-child navigation
CREATE INDEX idx_cat_snap_parent_path 
  ON category_performance_snapshots(retailer_id, parent_path, range_start);

-- Depth-based queries (e.g., "get all level 1 categories")
CREATE INDEX idx_cat_snap_depth 
  ON category_performance_snapshots(retailer_id, depth, range_start);

-- Performance filtering
CREATE INDEX idx_cat_snap_health 
  ON category_performance_snapshots(retailer_id, health_status, range_start);

-- Composite index for common query pattern (retailer + date + depth)
CREATE INDEX idx_cat_snap_retailer_date_depth 
  ON category_performance_snapshots(retailer_id, range_start, range_end, depth);

-- Unique constraint to prevent duplicate category snapshots
CREATE UNIQUE INDEX uq_cat_snapshot_category 
  ON category_performance_snapshots(
    retailer_id, 
    range_type, 
    range_start, 
    range_end, 
    category_level1,
    COALESCE(category_level2, ''),
    COALESCE(category_level3, ''),
    COALESCE(category_level4, ''),
    COALESCE(category_level5, '')
  );

-- Check constraint for date range
ALTER TABLE category_performance_snapshots 
  ADD CONSTRAINT chk_category_date_range CHECK (range_end >= range_start);

-- Comments for documentation
COMMENT ON TABLE category_performance_snapshots IS 
  'Category performance snapshots with tree structure. Each row represents a unique category path with both node-only and branch-aggregated metrics.';

COMMENT ON COLUMN category_performance_snapshots.node_impressions IS 
  'Impressions for products in THIS category only (not in any child categories)';

COMMENT ON COLUMN category_performance_snapshots.branch_impressions IS 
  'Impressions for products in this category AND all descendant categories (aggregated rollup)';

COMMENT ON COLUMN category_performance_snapshots.full_path IS 
  'Human-readable category path using " > " separator (e.g., "beauty & skincare > makeup > face")';

COMMENT ON COLUMN category_performance_snapshots.parent_path IS 
  'Full path of parent category (NULL for root-level categories)';

COMMENT ON COLUMN category_performance_snapshots.has_children IS 
  'TRUE if this category has child categories in the tree';

COMMENT ON COLUMN category_performance_snapshots.child_count IS 
  'Number of direct children (not recursive count of all descendants)';
