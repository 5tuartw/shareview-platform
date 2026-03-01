// services/reports/capture-snapshot.ts
//
// Captures a point-in-time snapshot of performance table data and domain metrics
// for a given domain/retailer/period. Called at report-creation time so the
// report always shows the data as it was when it was made, not the latest live
// snapshot.

import { query } from '@/lib/db'

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
const DEFAULT_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']

export interface VisibilityConfig {
  visible_tabs: string[]
  visible_metrics: string[]
  keyword_filters: string[]
  features_enabled: Record<string, boolean>
}

export async function captureVisibilityConfig(
  retailerId: string,
  // Only include tabs the user explicitly selected for this report.
  // This is the primary source of truth for which tabs appear in the snapshot —
  // the live retailer config is used for metrics/filters/features only.
  selectedDomains?: string[]
): Promise<VisibilityConfig> {
  const result = await query<{
    visible_tabs: string[] | null
    visible_metrics: string[] | null
    keyword_filters: string[] | null
    features_enabled: Record<string, boolean> | null
  }>(
    `SELECT visible_tabs, visible_metrics, keyword_filters, features_enabled
     FROM retailers WHERE retailer_id = $1`,
    [retailerId]
  )

  if (result.rows.length === 0) {
    return {
      visible_tabs: selectedDomains ?? DEFAULT_TABS,
      visible_metrics: DEFAULT_METRICS,
      keyword_filters: [],
      features_enabled: {},
    }
  }

  const row = result.rows[0]
  const liveTabs = row.visible_tabs ?? DEFAULT_TABS

  // Intersect live config with selected domains: a tab must be both enabled for
  // the retailer AND chosen by the report creator.
  const visible_tabs = selectedDomains
    ? liveTabs.filter(t => selectedDomains.includes(t))
    : liveTabs

  return {
    visible_tabs,
    visible_metrics: row.visible_metrics ?? DEFAULT_METRICS,
    keyword_filters: row.keyword_filters ?? [],
    features_enabled: row.features_enabled ?? {},
  }
}

export interface CapturedDomainData {
  performanceTable: Record<string, unknown> | null
  domainMetricsData: Record<string, unknown> | null
}

export async function captureSnapshotForDomain(
  retailerId: string,
  domain: string,
  periodStart: string,
  periodEnd: string
): Promise<CapturedDomainData> {
  // ─── domain_metrics ───────────────────────────────────────────────────────
  const metricsResult = await query(
    `SELECT component_type, component_data
     FROM domain_metrics
     WHERE retailer_id = $1
       AND page_type   = $2
       AND period_start = $3
       AND period_end   = $4
       AND is_active    = true`,
    [retailerId, domain, periodStart, periodEnd]
  )

  const domainMetricsData = metricsResult.rows.reduce<Record<string, unknown>>(
    (acc, m) => {
      if (m.component_type === 'metric_card') {
        if (!acc.metricCards) acc.metricCards = []
        ;(acc.metricCards as unknown[]).push(m.component_data)
      } else {
        acc[m.component_type] = m.component_data
      }
      return acc
    },
    {}
  )

  // ─── performance table (domain-specific snapshot) ─────────────────────────
  let performanceTable: Record<string, unknown> | null = null

  switch (domain) {
    case 'keywords': {
      const r = await query(
        `SELECT top_keywords, bottom_keywords, total_keywords, total_impressions,
                total_clicks, total_conversions, overall_ctr, overall_cvr,
                tier_star_count, tier_strong_count, tier_underperforming_count, tier_poor_count
         FROM keywords_snapshots
         WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3
         ORDER BY snapshot_date DESC LIMIT 1`,
        [retailerId, periodStart, periodEnd]
      )
      performanceTable = r.rows[0] ?? null
      break
    }

    case 'categories': {
      const r = await query(
        `SELECT
           COUNT(*) as total_categories,
           SUM(node_impressions) as total_impressions,
           SUM(node_clicks) as total_clicks,
           SUM(node_conversions) as total_conversions,
           CASE WHEN SUM(node_impressions) > 0
                THEN (SUM(node_clicks)::numeric / SUM(node_impressions)::numeric)
                ELSE 0 END as overall_ctr,
           CASE WHEN SUM(node_clicks) > 0
                THEN (SUM(node_conversions)::numeric / SUM(node_clicks)::numeric)
                ELSE 0 END as overall_cvr,
           COUNT(*) FILTER (WHERE health_status = 'broken')          as health_broken_count,
           COUNT(*) FILTER (WHERE health_status = 'underperforming')  as health_underperforming_count,
           COUNT(*) FILTER (WHERE health_status = 'attention')        as health_attention_count,
           COUNT(*) FILTER (WHERE health_status = 'healthy')          as health_healthy_count,
           COUNT(*) FILTER (WHERE health_status = 'star')             as health_star_count,
           jsonb_build_object(
             'broken',          COUNT(*) FILTER (WHERE health_status = 'broken'),
             'underperforming', COUNT(*) FILTER (WHERE health_status = 'underperforming'),
             'attention',       COUNT(*) FILTER (WHERE health_status = 'attention'),
             'healthy',         COUNT(*) FILTER (WHERE health_status = 'healthy'),
             'star',            COUNT(*) FILTER (WHERE health_status = 'star')
           ) as health_summary,
           jsonb_agg(
             jsonb_build_object(
               'path', full_path,
               'impressions', node_impressions,
               'clicks', node_clicks,
               'conversions', node_conversions,
               'ctr', node_ctr,
               'cvr', node_cvr,
               'health_status', health_status
             ) ORDER BY node_conversions DESC
           ) FILTER (WHERE depth <= 2) as categories
         FROM category_performance_snapshots
         WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3`,
        [retailerId, periodStart, periodEnd]
      )
      performanceTable = r.rows[0] ?? null
      break
    }

    case 'products': {
      const r = await query(
        `SELECT top_performers, underperformers, total_products, total_conversions,
                avg_ctr, avg_cvr, star_count, good_count, underperformer_count,
                top_1_pct_products, top_1_pct_conversions_share,
                products_with_wasted_clicks, total_wasted_clicks, wasted_clicks_percentage
         FROM product_performance_snapshots
         WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3
         ORDER BY snapshot_date DESC LIMIT 1`,
        [retailerId, periodStart, periodEnd]
      )
      performanceTable = r.rows[0] ?? null
      break
    }

    case 'auctions': {
      const r = await query(
        `SELECT competitors, avg_impression_share, total_competitors, avg_overlap_rate,
                avg_outranking_share, avg_being_outranked,
                top_competitor_id, top_competitor_overlap_rate, top_competitor_outranking_you,
                biggest_threat_id, biggest_threat_overlap_rate, biggest_threat_outranking_you,
                best_opportunity_id, best_opportunity_overlap_rate, best_opportunity_you_outranking
         FROM auction_insights_snapshots
         WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3
         ORDER BY snapshot_date DESC LIMIT 1`,
        [retailerId, periodStart, periodEnd]
      )
      performanceTable = r.rows[0] ?? null
      break
    }

    case 'overview':
      // Overview has no dedicated snapshot table – domain_metrics only.
      break
  }

  return {
    performanceTable,
    domainMetricsData: Object.keys(domainMetricsData).length > 0 ? domainMetricsData : null,
  }
}
