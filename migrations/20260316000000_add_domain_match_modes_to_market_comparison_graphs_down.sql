-- Migration: 20260316000000_add_domain_match_modes_to_market_comparison_graphs_down.sql
-- Description: Remove per-domain AND/OR operator storage for saved Market Comparison graphs

ALTER TABLE overview_market_comparison_graphs
  DROP CONSTRAINT IF EXISTS chk_mc_graphs_domain_match_modes_object;

ALTER TABLE overview_market_comparison_graphs
  DROP COLUMN IF EXISTS domain_match_modes;
