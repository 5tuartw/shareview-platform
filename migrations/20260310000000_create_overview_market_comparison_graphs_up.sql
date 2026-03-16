-- Migration: 20260310000000_create_overview_market_comparison_graphs_up.sql
-- Description: Store saved custom Market Comparison graphs for Overview tab

CREATE TABLE IF NOT EXISTS overview_market_comparison_graphs (
  id BIGSERIAL PRIMARY KEY,
  retailer_id TEXT NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'overview' CHECK (scope IN ('overview')),
  name TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('gmv', 'profit', 'impressions', 'clicks', 'conversions', 'ctr', 'cvr', 'roi')),
  view_type TEXT NOT NULL CHECK (view_type IN ('monthly', 'weekly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  include_provisional BOOLEAN NOT NULL DEFAULT true,
  match_mode TEXT NOT NULL DEFAULT 'all' CHECK (match_mode IN ('all', 'any')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_start <= period_end),
  CHECK (jsonb_typeof(filters) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_mc_graphs_retailer_scope_active_position
  ON overview_market_comparison_graphs (retailer_id, scope, is_active, position, created_at);

CREATE INDEX IF NOT EXISTS idx_mc_graphs_retailer_scope
  ON overview_market_comparison_graphs (retailer_id, scope);

COMMENT ON TABLE overview_market_comparison_graphs IS 'Saved custom graph specs for Overview > Market Comparison';
COMMENT ON COLUMN overview_market_comparison_graphs.filters IS 'JSON object of selected domain filters keyed by domain key';
COMMENT ON COLUMN overview_market_comparison_graphs.position IS 'Display order in Overview tab';
