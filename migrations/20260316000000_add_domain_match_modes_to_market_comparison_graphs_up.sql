-- Migration: 20260316000000_add_domain_match_modes_to_market_comparison_graphs_up.sql
-- Description: Add per-domain AND/OR operator storage for saved Market Comparison graphs

ALTER TABLE overview_market_comparison_graphs
  ADD COLUMN IF NOT EXISTS domain_match_modes JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE overview_market_comparison_graphs
  ADD CONSTRAINT chk_mc_graphs_domain_match_modes_object
  CHECK (jsonb_typeof(domain_match_modes) = 'object');

COMMENT ON COLUMN overview_market_comparison_graphs.domain_match_modes IS
  'JSON object keyed by domain key with per-domain match mode (all/any) for selected values';
