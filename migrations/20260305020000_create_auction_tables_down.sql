-- ============================================================================
-- Migration: Create auction insight tables
-- Down: 20260305020000
-- ============================================================================
-- Drops tables in reverse dependency order.

DROP TABLE IF EXISTS auction_insights_snapshots CASCADE;
DROP TABLE IF EXISTS auction_retailer_overrides CASCADE;
DROP TABLE IF EXISTS auction_insights CASCADE;
DROP TABLE IF EXISTS auction_uploads CASCADE;
DROP TABLE IF EXISTS auction_slug_assignments CASCADE;
