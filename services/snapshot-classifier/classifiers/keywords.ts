import type { Pool } from 'pg'
import { classifyPerformance } from '../../../lib/performanceTiers'
import type { ClassificationResult } from '../types'

type KeywordRow = {
  search_term: string
  cvr: number | string | null
  impressions: number | string | null
}

const toNumber = (value: number | string | null): number => {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : Number(value)
}

const toOptionalNumber = (value: number | string | null): number | undefined => {
  if (value === null || value === undefined) return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export const classifyKeywordsSnapshot = async (
  retailerId: string,
  periodStart: string,
  periodEnd: string,
  sourcePool: Pool,
  targetPool: Pool,
  options: { dryRun?: boolean } = {}
): Promise<ClassificationResult> => {
  const result = await sourcePool.query<KeywordRow>(
    `
    SELECT
      search_term,
      COALESCE(SUM(impressions), 0)::bigint AS impressions,
      CASE
        WHEN COALESCE(SUM(clicks), 0) > 0
          THEN (SUM(conversions)::numeric / SUM(clicks)) * 100
        ELSE NULL
      END AS cvr
    FROM keywords
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
    GROUP BY search_term
    `,
    [retailerId, periodStart, periodEnd]
  )

  if (result.rowCount === 0) {
    return {
      domain: 'keywords',
      retailerId,
      month: periodStart.slice(0, 7),
      counts: {
        tier_star_count: 0,
        tier_strong_count: 0,
        tier_underperforming_count: 0,
        tier_poor_count: 0,
      },
      operation: 'skipped',
    }
  }

  const tierCounts = {
    star: 0,
    strong: 0,
    moderate: 0,
    underperforming: 0,
    critical: 0,
  }

  for (const row of result.rows) {
    const status = classifyPerformance(
      toNumber(row.cvr),
      toOptionalNumber(row.impressions)
    )
    tierCounts[status] += 1
  }

  const tierStarCount = tierCounts.star
  const tierStrongCount = tierCounts.strong
  const tierUnderperformingCount = tierCounts.moderate + tierCounts.underperforming
  const tierPoorCount = tierCounts.critical

  if (!options.dryRun) {
    await targetPool.query(
      `
      UPDATE keywords_snapshots
      SET
        tier_star_count = $1,
        tier_strong_count = $2,
        tier_underperforming_count = $3,
        tier_poor_count = $4,
        last_updated = NOW(),
        classified_at = NOW()
      WHERE retailer_id = $5
        AND range_start = $6
        AND range_end = $7
      `,
      [
        tierStarCount,
        tierStrongCount,
        tierUnderperformingCount,
        tierPoorCount,
        retailerId,
        periodStart,
        periodEnd,
      ]
    )
  }

  return {
    domain: 'keywords',
    retailerId,
    month: periodStart.slice(0, 7),
    counts: {
      tier_star_count: tierStarCount,
      tier_strong_count: tierStrongCount,
      tier_underperforming_count: tierUnderperformingCount,
      tier_poor_count: tierPoorCount,
    },
    operation: options.dryRun ? 'skipped' : 'classified',
  }
}
