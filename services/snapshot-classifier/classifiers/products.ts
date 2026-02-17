import type { Pool } from 'pg'
import { classifyPerformance } from '../../../lib/performanceTiers'
import type { ClassificationResult } from '../types'

type ProductRow = {
  item_id: string
  product_title: string
  impressions: number | string | null
  clicks: number | string | null
  conversions: number | string | null
  ctr: number | string | null
  cvr: number | string | null
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

const getTopShare = (rows: ProductRow[], percent: number): { count: number; share: number } => {
  const totalProducts = rows.length
  if (totalProducts === 0) {
    return { count: 0, share: 0 }
  }

  const totalConversions = rows.reduce((sum, row) => sum + toNumber(row.conversions), 0)
  const count = Math.max(1, Math.ceil(totalProducts * percent))
  const topConversions = rows.slice(0, count).reduce((sum, row) => sum + toNumber(row.conversions), 0)
  const share = totalConversions > 0 ? Number(((topConversions / totalConversions) * 100).toFixed(2)) : 0

  return { count, share }
}

export const classifyProductSnapshot = async (
  retailerId: string,
  periodStart: string,
  periodEnd: string,
  sourcePool: Pool,
  targetPool: Pool,
  options: { dryRun?: boolean } = {}
): Promise<ClassificationResult> => {
  const result = await sourcePool.query<ProductRow>(
    `
    SELECT
      item_id,
      MAX(product_title) AS product_title,
      COALESCE(SUM(impressions), 0)::bigint AS impressions,
      COALESCE(SUM(clicks), 0)::bigint AS clicks,
      COALESCE(SUM(conversions), 0)::numeric AS conversions,
      CASE
        WHEN COALESCE(SUM(impressions), 0) > 0
          THEN (SUM(clicks)::numeric / SUM(impressions)) * 100
        ELSE NULL
      END AS ctr,
      CASE
        WHEN COALESCE(SUM(clicks), 0) > 0
          THEN (SUM(conversions)::numeric / SUM(clicks)) * 100
        ELSE NULL
      END AS cvr
    FROM product_performance
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
    GROUP BY item_id
    ORDER BY conversions DESC
    `,
    [retailerId, periodStart, periodEnd]
  )

  if (result.rowCount === 0) {
    return {
      domain: 'products',
      retailerId,
      month: periodStart.slice(0, 7),
      counts: {
        star_count: 0,
        good_count: 0,
        underperformer_count: 0,
        top_1_pct_products: 0,
        top_1_pct_conversions_share: 0,
        top_5_pct_products: 0,
        top_5_pct_conversions_share: 0,
        top_10_pct_products: 0,
        top_10_pct_conversions_share: 0,
        products_with_wasted_clicks: 0,
        total_wasted_clicks: 0,
        wasted_clicks_percentage: 0,
      },
      operation: 'skipped',
    }
  }

  const tierCounts = {
    star: 0,
    good: 0,
    underperformer: 0,
  }

  for (const row of result.rows) {
    const status = classifyPerformance(toNumber(row.cvr), toOptionalNumber(row.impressions))
    if (status === 'star') {
      tierCounts.star += 1
    } else if (status === 'strong' || status === 'moderate') {
      tierCounts.good += 1
    } else {
      tierCounts.underperformer += 1
    }
  }

  const totalClicks = result.rows.reduce((sum, row) => sum + toNumber(row.clicks), 0)
  const wasted = result.rows.filter((row) => toNumber(row.ctr) > 5 && toNumber(row.cvr) < 1)
  const productsWithWastedClicks = wasted.length
  const totalWastedClicks = wasted.reduce((sum, row) => sum + toNumber(row.clicks), 0)
  const wastedClicksPercentage = totalClicks > 0
    ? Number(((totalWastedClicks / totalClicks) * 100).toFixed(2))
    : 0

  const top1 = getTopShare(result.rows, 0.01)
  const top5 = getTopShare(result.rows, 0.05)
  const top10 = getTopShare(result.rows, 0.1)

  if (!options.dryRun) {
    await targetPool.query(
      `
      UPDATE product_performance_snapshots
      SET
        star_count = $1,
        good_count = $2,
        underperformer_count = $3,
        top_1_pct_products = $4,
        top_1_pct_conversions_share = $5,
        top_5_pct_products = $6,
        top_5_pct_conversions_share = $7,
        top_10_pct_products = $8,
        top_10_pct_conversions_share = $9,
        products_with_wasted_clicks = $10,
        total_wasted_clicks = $11,
        wasted_clicks_percentage = $12,
        last_updated = NOW(),
        classified_at = NOW()
      WHERE retailer_id = $13
        AND range_start = $14
        AND range_end = $15
      `,
      [
        tierCounts.star,
        tierCounts.good,
        tierCounts.underperformer,
        top1.count,
        top1.share,
        top5.count,
        top5.share,
        top10.count,
        top10.share,
        productsWithWastedClicks,
        totalWastedClicks,
        wastedClicksPercentage,
        retailerId,
        periodStart,
        periodEnd,
      ]
    )
  }

  return {
    domain: 'products',
    retailerId,
    month: periodStart.slice(0, 7),
    counts: {
      star_count: tierCounts.star,
      good_count: tierCounts.good,
      underperformer_count: tierCounts.underperformer,
      top_1_pct_products: top1.count,
      top_1_pct_conversions_share: top1.share,
      top_5_pct_products: top5.count,
      top_5_pct_conversions_share: top5.share,
      top_10_pct_products: top10.count,
      top_10_pct_conversions_share: top10.share,
      products_with_wasted_clicks: productsWithWastedClicks,
      total_wasted_clicks: totalWastedClicks,
      wasted_clicks_percentage: wastedClicksPercentage,
    },
    operation: options.dryRun ? 'skipped' : 'classified',
  }
}
