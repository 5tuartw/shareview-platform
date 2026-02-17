import type { Pool } from 'pg'
import { classifyPerformance } from '../../../lib/performanceTiers'
import type { ClassificationResult } from '../types'

type CategoryRow = {
  category_path: string
  impressions: number | string | null
  clicks: number | string | null
  conversions: number | string | null
  cvr: number | string | null
}

type CategorySummary = {
  category_path: string
  cvr: number | null
  impressions: number
  clicks: number
  conversions: number
}

type HealthStatus = 'broken' | 'underperforming' | 'attention' | 'healthy' | 'star'

const toNumber = (value: number | string | null): number => {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : Number(value)
}

const toNullableNumber = (value: number | string | null): number | null => {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

const getHealthStatus = (cvr: number | null, impressions: number): HealthStatus => {
  if (cvr === null) return 'attention'

  const status = classifyPerformance(cvr, impressions)
  if (status === 'star') return 'star'
  if (status === 'strong' || status === 'moderate') return 'healthy'
  if (status === 'underperforming') return 'underperforming'
  return 'broken'
}

export const classifyCategorySnapshot = async (
  retailerId: string,
  periodStart: string,
  periodEnd: string,
  sourcePool: Pool,
  targetPool: Pool,
  options: { dryRun?: boolean } = {}
): Promise<ClassificationResult> => {
  const result = await sourcePool.query<CategoryRow>(
    `
    SELECT
      CONCAT_WS('>', category_level1, category_level2, category_level3, category_level4, category_level5) AS category_path,
      COALESCE(SUM(impressions), 0)::bigint AS impressions,
      COALESCE(SUM(clicks), 0)::bigint AS clicks,
      COALESCE(SUM(conversions), 0)::numeric AS conversions,
      CASE
        WHEN COALESCE(SUM(clicks), 0) > 0
          THEN (SUM(conversions)::numeric / SUM(clicks)) * 100
        ELSE NULL
      END AS cvr
    FROM category_performance
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
    GROUP BY category_path
    `,
    [retailerId, periodStart, periodEnd]
  )

  if (result.rowCount === 0) {
    return {
      domain: 'categories',
      retailerId,
      month: periodStart.slice(0, 7),
      counts: {
        health_broken_count: 0,
        health_underperforming_count: 0,
        health_attention_count: 0,
        health_healthy_count: 0,
        health_star_count: 0,
      },
      operation: 'skipped',
    }
  }

  const counts = {
    broken: 0,
    underperforming: 0,
    attention: 0,
    healthy: 0,
    star: 0,
  }

  const healthSummary: Record<HealthStatus, CategorySummary[]> = {
    broken: [],
    underperforming: [],
    attention: [],
    healthy: [],
    star: [],
  }

  for (const row of result.rows) {
    const impressions = toNumber(row.impressions)
    const clicks = toNumber(row.clicks)
    const conversions = toNumber(row.conversions)
    const cvr = toNullableNumber(row.cvr)
    const status = getHealthStatus(cvr, impressions)

    counts[status] += 1
    healthSummary[status].push({
      category_path: row.category_path,
      cvr,
      impressions,
      clicks,
      conversions,
    })
  }

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const percentage = (value: number): number => {
    if (total === 0) return 0
    return Number(((value / total) * 100).toFixed(2))
  }

  const distribution = {
    broken: percentage(counts.broken),
    underperforming: percentage(counts.underperforming),
    attention: percentage(counts.attention),
    healthy: percentage(counts.healthy),
    star: percentage(counts.star),
  }

  if (!options.dryRun) {
    await targetPool.query(
      `
      UPDATE category_performance_snapshots
      SET
        health_broken_count = $1,
        health_underperforming_count = $2,
        health_attention_count = $3,
        health_healthy_count = $4,
        health_star_count = $5,
        health_summary = $6,
        last_updated = NOW(),
        classified_at = NOW()
      WHERE retailer_id = $7
        AND range_start = $8
        AND range_end = $9
      `,
      [
        counts.broken,
        counts.underperforming,
        counts.attention,
        counts.healthy,
        counts.star,
        JSON.stringify(healthSummary),
        retailerId,
        periodStart,
        periodEnd,
      ]
    )
  }

  return {
    domain: 'categories',
    retailerId,
    month: periodStart.slice(0, 7),
    counts: {
      health_broken_count: counts.broken,
      health_underperforming_count: counts.underperforming,
      health_attention_count: counts.attention,
      health_healthy_count: counts.healthy,
      health_star_count: counts.star,
      health_broken_percentage: distribution.broken,
      health_underperforming_percentage: distribution.underperforming,
      health_attention_percentage: distribution.attention,
      health_healthy_percentage: distribution.healthy,
      health_star_percentage: distribution.star,
    },
    operation: options.dryRun ? 'skipped' : 'classified',
  }
}
