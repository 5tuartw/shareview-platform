import { query } from '@/lib/db'
import { type AuctionQuadrantThresholds, DEFAULT_AUCTION_QUADRANT_THRESHOLDS } from '@/lib/auction-quadrants'

type QueryExecutor = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>
}

const toNumber = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(numeric) ? numeric : fallback
}

const clampThreshold = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export async function fetchAuctionClassificationSettings(executor: QueryExecutor = { query }): Promise<AuctionQuadrantThresholds> {
  const result = await executor.query<{
    overlap_high_threshold: string | number | null
    impression_share_high_threshold: string | number | null
  }>(
    `SELECT overlap_high_threshold, impression_share_high_threshold
     FROM auction_classification_settings
     ORDER BY id ASC
     LIMIT 1`
  )

  if (result.rows.length === 0) {
    await executor.query(
      `INSERT INTO auction_classification_settings (id, overlap_high_threshold, impression_share_high_threshold)
       VALUES (1, $1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [DEFAULT_AUCTION_QUADRANT_THRESHOLDS.overlapHigh, DEFAULT_AUCTION_QUADRANT_THRESHOLDS.impressionShareHigh],
    )
    return { ...DEFAULT_AUCTION_QUADRANT_THRESHOLDS }
  }

  const row = result.rows[0]
  return {
    overlapHigh: clampThreshold(toNumber(row.overlap_high_threshold, DEFAULT_AUCTION_QUADRANT_THRESHOLDS.overlapHigh)),
    impressionShareHigh: clampThreshold(
      toNumber(row.impression_share_high_threshold, DEFAULT_AUCTION_QUADRANT_THRESHOLDS.impressionShareHigh),
    ),
  }
}

export async function fetchAuctionClassificationOverrideMap(
  retailerIds: string[],
  executor: QueryExecutor = { query },
): Promise<Map<string, Partial<AuctionQuadrantThresholds>>> {
  const map = new Map<string, Partial<AuctionQuadrantThresholds>>()
  if (retailerIds.length === 0) return map

  const result = await executor.query<{
    retailer_id: string
    overlap_high_threshold: string | number | null
    impression_share_high_threshold: string | number | null
  }>(
    `SELECT retailer_id, overlap_high_threshold, impression_share_high_threshold
     FROM auction_classification_overrides
     WHERE is_active = TRUE
       AND retailer_id = ANY($1::text[])`,
    [retailerIds],
  )

  for (const row of result.rows) {
    const partial: Partial<AuctionQuadrantThresholds> = {}
    if (row.overlap_high_threshold != null) {
      partial.overlapHigh = clampThreshold(toNumber(row.overlap_high_threshold, DEFAULT_AUCTION_QUADRANT_THRESHOLDS.overlapHigh))
    }
    if (row.impression_share_high_threshold != null) {
      partial.impressionShareHigh = clampThreshold(
        toNumber(row.impression_share_high_threshold, DEFAULT_AUCTION_QUADRANT_THRESHOLDS.impressionShareHigh),
      )
    }
    map.set(row.retailer_id, partial)
  }

  return map
}

export async function recalculateAuctionQuadrants(
  retailerId?: string,
  executor: QueryExecutor = { query },
): Promise<{ rowsUpdated: number; retailersUpdated: number; monthsUpdated: number }> {
  const result = await executor.query<{
    rows_updated: string | number | null
    retailers_updated: string | number | null
    months_updated: string | number | null
  }>(
    `WITH global_settings AS (
       SELECT overlap_high_threshold, impression_share_high_threshold
       FROM auction_classification_settings
       ORDER BY id ASC
       LIMIT 1
     ),
     updated AS (
       UPDATE auction_insights ai
       SET competitor_quadrant = CASE
         WHEN ai.is_self = TRUE OR ai.overlap_rate IS NULL OR ai.impr_share IS NULL THEN 'unclassified'
         WHEN ai.overlap_rate >= COALESCE(
                (
                  SELECT o.overlap_high_threshold
                  FROM auction_classification_overrides o
                  WHERE o.retailer_id = ai.retailer_id AND o.is_active = TRUE
                  LIMIT 1
                ),
                gs.overlap_high_threshold
              )
              AND ai.impr_share >= COALESCE(
                (
                  SELECT o.impression_share_high_threshold
                  FROM auction_classification_overrides o
                  WHERE o.retailer_id = ai.retailer_id AND o.is_active = TRUE
                  LIMIT 1
                ),
                gs.impression_share_high_threshold
              )
           THEN 'primary_competitors'
         WHEN ai.overlap_rate >= COALESCE(
                (
                  SELECT o.overlap_high_threshold
                  FROM auction_classification_overrides o
                  WHERE o.retailer_id = ai.retailer_id AND o.is_active = TRUE
                  LIMIT 1
                ),
                gs.overlap_high_threshold
              )
              AND ai.impr_share < COALESCE(
                (
                  SELECT o.impression_share_high_threshold
                  FROM auction_classification_overrides o
                  WHERE o.retailer_id = ai.retailer_id AND o.is_active = TRUE
                  LIMIT 1
                ),
                gs.impression_share_high_threshold
              )
           THEN 'niche_emerging'
         WHEN ai.overlap_rate < COALESCE(
                (
                  SELECT o.overlap_high_threshold
                  FROM auction_classification_overrides o
                  WHERE o.retailer_id = ai.retailer_id AND o.is_active = TRUE
                  LIMIT 1
                ),
                gs.overlap_high_threshold
              )
              AND ai.impr_share >= COALESCE(
                (
                  SELECT o.impression_share_high_threshold
                  FROM auction_classification_overrides o
                  WHERE o.retailer_id = ai.retailer_id AND o.is_active = TRUE
                  LIMIT 1
                ),
                gs.impression_share_high_threshold
              )
           THEN 'category_leaders'
         ELSE 'peripheral_players'
       END
       FROM global_settings gs
       WHERE ($1::text IS NULL OR ai.retailer_id = $1)
       RETURNING ai.retailer_id, ai.month
     )
     SELECT
       COUNT(*)::bigint AS rows_updated,
       COUNT(DISTINCT retailer_id)::bigint AS retailers_updated,
       COUNT(DISTINCT month)::bigint AS months_updated
     FROM updated`,
    [retailerId ?? null],
  )

  const row = result.rows[0]
  return {
    rowsUpdated: Number(row?.rows_updated ?? 0),
    retailersUpdated: Number(row?.retailers_updated ?? 0),
    monthsUpdated: Number(row?.months_updated ?? 0),
  }
}