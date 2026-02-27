-- Add pre-computed health status classification columns to category_performance_snapshots.
-- health_status_node: classification based on the node's own (leaf-level) metrics only.
-- health_status_branch: classification based on the node's branch metrics (node + all descendants).
-- Both use the tier system: star | healthy | attention | underperforming | broken

ALTER TABLE category_performance_snapshots
  ADD COLUMN IF NOT EXISTS health_status_node    VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_status_branch  VARCHAR(20) DEFAULT NULL;

-- Index to support filtering by health tier in the API
CREATE INDEX IF NOT EXISTS idx_category_snapshots_health_node
  ON category_performance_snapshots (retailer_id, health_status_node);

CREATE INDEX IF NOT EXISTS idx_category_snapshots_health_branch
  ON category_performance_snapshots (retailer_id, health_status_branch);
