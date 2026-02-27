ALTER TABLE category_performance_snapshots
  DROP COLUMN IF EXISTS health_status_node,
  DROP COLUMN IF EXISTS health_status_branch;
