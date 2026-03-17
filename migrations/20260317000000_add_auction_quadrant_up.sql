ALTER TABLE auction_insights
ADD COLUMN competitor_quadrant TEXT CHECK (
  competitor_quadrant IN (
    'primary_competitors',
    'niche_emerging',
    'category_leaders',
    'peripheral_players',
    'unclassified'
  )
);

CREATE INDEX idx_auction_insights_quadrant
  ON auction_insights (retailer_id, month, competitor_quadrant)
  WHERE retailer_id IS NOT NULL;

UPDATE auction_insights
SET competitor_quadrant = CASE
  WHEN is_self = TRUE OR overlap_rate IS NULL OR impr_share IS NULL THEN 'unclassified'
  WHEN overlap_rate >= 0.5 AND impr_share >= 0.3 THEN 'primary_competitors'
  WHEN overlap_rate >= 0.5 AND impr_share < 0.3 THEN 'niche_emerging'
  WHEN overlap_rate < 0.5 AND impr_share >= 0.3 THEN 'category_leaders'
  ELSE 'peripheral_players'
END
WHERE competitor_quadrant IS NULL;
