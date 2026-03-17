export type AuctionQuadrant =
  | 'primary_competitors'
  | 'niche_emerging'
  | 'category_leaders'
  | 'peripheral_players'
  | 'unclassified'

export type AuctionQuadrantThresholds = {
  overlapHigh: number
  impressionShareHigh: number
}

// Tunable cut-offs for quadrant splits.
export const DEFAULT_AUCTION_QUADRANT_THRESHOLDS: AuctionQuadrantThresholds = {
  overlapHigh: 0.5,
  impressionShareHigh: 0.3,
}

export const AUCTION_QUADRANT_LABELS: Record<AuctionQuadrant, string> = {
  primary_competitors: 'Primary competitors',
  niche_emerging: 'Niche / emerging',
  category_leaders: 'Category leaders',
  peripheral_players: 'Peripheral players',
  unclassified: 'Unclassified',
}

export function classifyAuctionCompetitorQuadrant(
  overlapRate: number | null | undefined,
  impressionShare: number | null | undefined,
  isSelf = false,
  thresholds: AuctionQuadrantThresholds = DEFAULT_AUCTION_QUADRANT_THRESHOLDS,
): AuctionQuadrant {
  if (isSelf) return 'unclassified'
  if (overlapRate == null || impressionShare == null) return 'unclassified'

  const overlapHigh = overlapRate >= thresholds.overlapHigh
  const shareHigh = impressionShare >= thresholds.impressionShareHigh

  if (overlapHigh && shareHigh) return 'primary_competitors'
  if (overlapHigh && !shareHigh) return 'niche_emerging'
  if (!overlapHigh && shareHigh) return 'category_leaders'
  return 'peripheral_players'
}
