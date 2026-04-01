import { query } from '@/lib/db'

export type KeywordThresholdTier = {
  id: number
  tier_name: string
  display_order: number
  min_impressions: number
  min_clicks: number
  fallback_min_impressions: number
  fallback_min_clicks: number
  low_volume_trigger_qualified: number
  low_volume_trigger_positive: number
  is_default: boolean
}

export type KeywordThresholdOverride = {
  retailer_id: string
  retailer_name: string
  tier_id: number | null
  tier_name: string | null
  custom_min_impressions: number | null
  custom_min_clicks: number | null
  custom_fallback_min_impressions: number | null
  custom_fallback_min_clicks: number | null
  is_active: boolean
  updated_at: string | null
}

type QueryExecutor = {
  query: typeof query
}

/** Fetch all keyword threshold tiers ordered by display_order */
export async function fetchKeywordThresholdTiers(
  executor: QueryExecutor = { query },
): Promise<KeywordThresholdTier[]> {
  const result = await executor.query<KeywordThresholdTier>(
    `SELECT id, tier_name, display_order, min_impressions, min_clicks,
            fallback_min_impressions, fallback_min_clicks,
            low_volume_trigger_qualified, low_volume_trigger_positive, is_default
     FROM keyword_threshold_tiers
     ORDER BY display_order ASC`,
  )
  return result.rows.map((row) => ({
    id: Number(row.id),
    tier_name: row.tier_name,
    display_order: Number(row.display_order),
    min_impressions: Number(row.min_impressions),
    min_clicks: Number(row.min_clicks),
    fallback_min_impressions: Number(row.fallback_min_impressions),
    fallback_min_clicks: Number(row.fallback_min_clicks),
    low_volume_trigger_qualified: Number(row.low_volume_trigger_qualified),
    low_volume_trigger_positive: Number(row.low_volume_trigger_positive),
    is_default: Boolean(row.is_default),
  }))
}

/** Fetch the default tier (the one with is_default = true) */
export async function fetchDefaultKeywordTier(
  executor: QueryExecutor = { query },
): Promise<KeywordThresholdTier | null> {
  const result = await executor.query<KeywordThresholdTier>(
    `SELECT id, tier_name, display_order, min_impressions, min_clicks,
            fallback_min_impressions, fallback_min_clicks,
            low_volume_trigger_qualified, low_volume_trigger_positive, is_default
     FROM keyword_threshold_tiers
     WHERE is_default = TRUE
     LIMIT 1`,
  )
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  return {
    id: Number(row.id),
    tier_name: row.tier_name,
    display_order: Number(row.display_order),
    min_impressions: Number(row.min_impressions),
    min_clicks: Number(row.min_clicks),
    fallback_min_impressions: Number(row.fallback_min_impressions),
    fallback_min_clicks: Number(row.fallback_min_clicks),
    low_volume_trigger_qualified: Number(row.low_volume_trigger_qualified),
    low_volume_trigger_positive: Number(row.low_volume_trigger_positive),
    is_default: Boolean(row.is_default),
  }
}

/** Fetch all active keyword threshold overrides with retailer names */
export async function fetchKeywordThresholdOverrides(
  executor: QueryExecutor = { query },
): Promise<KeywordThresholdOverride[]> {
  const result = await executor.query<KeywordThresholdOverride>(
    `SELECT o.retailer_id, r.retailer_name,
            o.tier_id, t.tier_name,
            o.custom_min_impressions, o.custom_min_clicks,
            o.custom_fallback_min_impressions, o.custom_fallback_min_clicks,
            o.is_active, o.updated_at::text
     FROM keyword_threshold_overrides o
     JOIN retailers r ON r.retailer_id = o.retailer_id
     LEFT JOIN keyword_threshold_tiers t ON t.id = o.tier_id
     WHERE o.is_active = TRUE
     ORDER BY r.retailer_name ASC`,
  )
  return result.rows
}

/** Resolve the effective thresholds for a given retailer.
 *  Priority: custom override values > assigned tier > default tier > hardcoded fallback.
 */
export type ResolvedKeywordThresholds = {
  min_impressions: number
  min_clicks: number
  fallback_min_impressions: number
  fallback_min_clicks: number
  low_volume_trigger_qualified: number
  low_volume_trigger_positive: number
}

const HARDCODED_DEFAULTS: ResolvedKeywordThresholds = {
  min_impressions: 50,
  min_clicks: 5,
  fallback_min_impressions: 30,
  fallback_min_clicks: 3,
  low_volume_trigger_qualified: 30,
  low_volume_trigger_positive: 20,
}

export async function resolveKeywordThresholds(
  retailerId: string,
  executor: QueryExecutor = { query },
): Promise<ResolvedKeywordThresholds> {
  // Check for per-retailer override
  const overrideResult = await executor.query<{
    tier_id: number | null
    custom_min_impressions: number | null
    custom_min_clicks: number | null
    custom_fallback_min_impressions: number | null
    custom_fallback_min_clicks: number | null
  }>(
    `SELECT tier_id, custom_min_impressions, custom_min_clicks,
            custom_fallback_min_impressions, custom_fallback_min_clicks
     FROM keyword_threshold_overrides
     WHERE retailer_id = $1 AND is_active = TRUE
     LIMIT 1`,
    [retailerId],
  )

  let baseTier: ResolvedKeywordThresholds = { ...HARDCODED_DEFAULTS }

  if (overrideResult.rows.length > 0) {
    const override = overrideResult.rows[0]

    // If assigned to a tier, load that tier first
    if (override.tier_id != null) {
      const tierResult = await executor.query<KeywordThresholdTier>(
        `SELECT min_impressions, min_clicks, fallback_min_impressions, fallback_min_clicks,
                low_volume_trigger_qualified, low_volume_trigger_positive
         FROM keyword_threshold_tiers WHERE id = $1`,
        [override.tier_id],
      )
      if (tierResult.rows.length > 0) {
        const t = tierResult.rows[0]
        baseTier = {
          min_impressions: Number(t.min_impressions),
          min_clicks: Number(t.min_clicks),
          fallback_min_impressions: Number(t.fallback_min_impressions),
          fallback_min_clicks: Number(t.fallback_min_clicks),
          low_volume_trigger_qualified: Number(t.low_volume_trigger_qualified),
          low_volume_trigger_positive: Number(t.low_volume_trigger_positive),
        }
      }
    }

    // Apply custom overrides on top
    if (override.custom_min_impressions != null) baseTier.min_impressions = Number(override.custom_min_impressions)
    if (override.custom_min_clicks != null) baseTier.min_clicks = Number(override.custom_min_clicks)
    if (override.custom_fallback_min_impressions != null) baseTier.fallback_min_impressions = Number(override.custom_fallback_min_impressions)
    if (override.custom_fallback_min_clicks != null) baseTier.fallback_min_clicks = Number(override.custom_fallback_min_clicks)

    return baseTier
  }

  // No override — use default tier
  const defaultTier = await fetchDefaultKeywordTier(executor)
  if (defaultTier) {
    return {
      min_impressions: defaultTier.min_impressions,
      min_clicks: defaultTier.min_clicks,
      fallback_min_impressions: defaultTier.fallback_min_impressions,
      fallback_min_clicks: defaultTier.fallback_min_clicks,
      low_volume_trigger_qualified: defaultTier.low_volume_trigger_qualified,
      low_volume_trigger_positive: defaultTier.low_volume_trigger_positive,
    }
  }

  return baseTier
}

/** Bulk-resolve thresholds for all retailers. Returns a map retailerId -> thresholds.
 *  Retailers without an override get the default tier.
 */
export async function resolveAllKeywordThresholds(
  executor: QueryExecutor = { query },
): Promise<{ defaults: ResolvedKeywordThresholds; overrides: Map<string, ResolvedKeywordThresholds> }> {
  const tiers = await fetchKeywordThresholdTiers(executor)
  const tierMap = new Map(tiers.map((t) => [t.id, t]))
  const defaultTier = tiers.find((t) => t.is_default)

  const defaults: ResolvedKeywordThresholds = defaultTier
    ? {
        min_impressions: defaultTier.min_impressions,
        min_clicks: defaultTier.min_clicks,
        fallback_min_impressions: defaultTier.fallback_min_impressions,
        fallback_min_clicks: defaultTier.fallback_min_clicks,
        low_volume_trigger_qualified: defaultTier.low_volume_trigger_qualified,
        low_volume_trigger_positive: defaultTier.low_volume_trigger_positive,
      }
    : { ...HARDCODED_DEFAULTS }

  const overridesResult = await executor.query<{
    retailer_id: string
    tier_id: number | null
    custom_min_impressions: number | null
    custom_min_clicks: number | null
    custom_fallback_min_impressions: number | null
    custom_fallback_min_clicks: number | null
  }>(
    `SELECT retailer_id, tier_id, custom_min_impressions, custom_min_clicks,
            custom_fallback_min_impressions, custom_fallback_min_clicks
     FROM keyword_threshold_overrides
     WHERE is_active = TRUE`,
  )

  const overrideMap = new Map<string, ResolvedKeywordThresholds>()
  for (const o of overridesResult.rows) {
    let base = { ...defaults }
    if (o.tier_id != null) {
      const t = tierMap.get(Number(o.tier_id))
      if (t) {
        base = {
          min_impressions: t.min_impressions,
          min_clicks: t.min_clicks,
          fallback_min_impressions: t.fallback_min_impressions,
          fallback_min_clicks: t.fallback_min_clicks,
          low_volume_trigger_qualified: t.low_volume_trigger_qualified,
          low_volume_trigger_positive: t.low_volume_trigger_positive,
        }
      }
    }
    if (o.custom_min_impressions != null) base.min_impressions = Number(o.custom_min_impressions)
    if (o.custom_min_clicks != null) base.min_clicks = Number(o.custom_min_clicks)
    if (o.custom_fallback_min_impressions != null) base.fallback_min_impressions = Number(o.custom_fallback_min_impressions)
    if (o.custom_fallback_min_clicks != null) base.fallback_min_clicks = Number(o.custom_fallback_min_clicks)
    overrideMap.set(o.retailer_id, base)
  }

  return { defaults, overrides: overrideMap }
}
