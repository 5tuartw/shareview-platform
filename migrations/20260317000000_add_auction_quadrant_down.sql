DROP INDEX IF EXISTS idx_auction_insights_quadrant;

ALTER TABLE auction_insights
DROP COLUMN IF EXISTS competitor_quadrant;
