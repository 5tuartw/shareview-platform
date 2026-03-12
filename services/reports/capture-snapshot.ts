// services/reports/capture-snapshot.ts
//
// Captures a point-in-time snapshot of performance table data and domain metrics
// for a given domain/retailer/period. Called at report-creation time so the
// report always shows the data as it was when it was made, not the latest live
// snapshot.

import { query } from '@/lib/db'
import { queryAnalytics, getAnalyticsNetworkId } from '@/lib/db'
import { buildOverviewMonthlyQuery } from '@/lib/overview-monthly-sql'

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
const DEFAULT_METRICS = ['gmv', 'commission', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'profit', 'validation_rate']

export interface VisibilityConfig {
  visible_tabs: string[]
  visible_metrics: string[]
  keyword_filters: string[]
  product_filters: string[]
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
    product_filters: string[] | null
    features_enabled: Record<string, boolean> | null
  }>(
    `SELECT visible_tabs, visible_metrics, keyword_filters, product_filters, features_enabled
     FROM retailers WHERE retailer_id = $1`,
    [retailerId]
  )

  if (result.rows.length === 0) {
    return {
      visible_tabs: selectedDomains ?? DEFAULT_TABS,
      visible_metrics: DEFAULT_METRICS,
      keyword_filters: [],
      product_filters: [],
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
    product_filters: row.product_filters ?? [],
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
  periodEnd: string,
  overviewSnapshotConfig?: {
    view_type: 'monthly' | 'weekly'
    month_period: string
    week_period?: string
    monthly_window: number
    weekly_window: number
  }
): Promise<CapturedDomainData> {
  const calculatePercentageChange = (current: number | null, previous: number | null): number | null => {
    if (current === null || previous === null || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const buildOverviewSnapshot = async (): Promise<Record<string, unknown> | null> => {
    const overviewViewType = overviewSnapshotConfig?.view_type ?? 'monthly'
    const selectedMonth = overviewSnapshotConfig?.month_period || periodStart.slice(0, 7)
    const weeklyWindow = Math.max(1, Math.min(overviewSnapshotConfig?.weekly_window ?? 13, 26))
    const monthlyWindow = Math.max(1, Math.min(overviewSnapshotConfig?.monthly_window ?? 12, 13))
    const periodStartDate = `${selectedMonth}-01`
    const networkId = await getAnalyticsNetworkId(retailerId)
    const analyticsRetailerId = networkId ?? retailerId

    if (overviewViewType === 'weekly') {
      const weeklyResult = await queryAnalytics(
        `SELECT DISTINCT ON (rm.period_start_date)
                rm.period_start_date AS period_start,
                rm.gmv,
                rm.google_conversions_transaction AS conversions,
                rm.profit,
                rm.roi,
                rm.impressions,
                rm.google_clicks AS clicks,
                rm.ctr,
                rm.conversion_rate AS cvr,
                rm.validation_rate,
                rm.commission_validated AS commission
         FROM retailer_metrics rm
         JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
         WHERE rm.retailer_id = $1
           AND rm.period_start_date IS NOT NULL
           AND fr.fetch_type = '13_weeks'
         ORDER BY rm.period_start_date ASC, rm.fetch_datetime DESC`,
        [analyticsRetailerId]
      )

      const orderedWeeks = weeklyResult.rows
      if (orderedWeeks.length > 0) {
        const selectedWeek = overviewSnapshotConfig?.week_period
        let anchorIdx = orderedWeeks.length - 1
        if (selectedWeek) {
          const selectedWeekDate = new Date(`${selectedWeek.slice(0, 10)}T00:00:00Z`)
          for (let i = orderedWeeks.length - 1; i >= 0; i--) {
            const rowDate = new Date(`${String(orderedWeeks[i].period_start).slice(0, 10)}T00:00:00Z`)
            if (!Number.isNaN(selectedWeekDate.getTime()) && rowDate <= selectedWeekDate) {
              anchorIdx = i
              break
            }
          }
        }

        const sliceStart = Math.max(0, anchorIdx - weeklyWindow + 1)
        const history = orderedWeeks.slice(sliceStart, anchorIdx + 1)
        const latest = orderedWeeks[anchorIdx] as Record<string, unknown>
        const previous = orderedWeeks[anchorIdx - 1] as Record<string, unknown> | undefined

        return {
          view_type: 'weekly',
          source: 'report_snapshot',
          snapshot_settings: {
            view_type: 'weekly',
            week_period: String(latest.period_start ?? overviewSnapshotConfig?.week_period ?? ''),
            month_period: selectedMonth,
            window_size: weeklyWindow,
          },
          metrics: {
            gmv: Number(latest.gmv ?? 0),
            conversions: Number(latest.conversions ?? 0),
            profit: Number(latest.profit ?? 0),
            roi: Number(latest.roi ?? 0),
            impressions: Number(latest.impressions ?? 0),
            clicks: Number(latest.clicks ?? 0),
            ctr: Number(latest.ctr ?? 0),
            cvr: Number(latest.cvr ?? 0),
            validation_rate: Number(latest.validation_rate ?? 0),
          },
          coverage: {
            percentage: 0,
            products_with_ads: 0,
            total_products: 0,
          },
          history,
          comparisons: {
            gmv_change_pct: calculatePercentageChange(Number(latest.gmv ?? 0), previous ? Number(previous.gmv ?? 0) : null),
            conversions_change_pct: calculatePercentageChange(
              Number(latest.conversions ?? 0),
              previous ? Number(previous.conversions ?? 0) : null
            ),
            roi_change_pct: calculatePercentageChange(Number(latest.roi ?? 0), previous ? Number(previous.roi ?? 0) : null),
          },
          last_updated: periodEnd,
        }
      }
    }

    const monthStartColumn = await queryAnalytics<{ has_column: boolean }>(
      `SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'monthly_archive'
            AND column_name = 'month_start'
        ) AS has_column`
    )

    const monthlyQuery = buildOverviewMonthlyQuery(
      monthStartColumn.rows[0]?.has_column ? 'withMonthStart' : 'withMonthYear'
    )
    const monthlyResult = await queryAnalytics(monthlyQuery, [analyticsRetailerId, periodStartDate])

    if (monthlyResult.rows.length > 0) {
      const historyDesc = monthlyResult.rows.slice(0, monthlyWindow)
      const ordered = [...historyDesc].reverse()
      const latest = monthlyResult.rows[0] as Record<string, number>
      const previous = monthlyResult.rows[1] as Record<string, number> | undefined

      const comparisons = {
        gmv_change_pct: calculatePercentageChange(Number(latest.gmv ?? 0), previous ? Number(previous.gmv ?? 0) : null),
        conversions_change_pct: calculatePercentageChange(Number(latest.conversions ?? 0), previous ? Number(previous.conversions ?? 0) : null),
        roi_change_pct: calculatePercentageChange(Number(latest.roi ?? 0), previous ? Number(previous.roi ?? 0) : null),
      }

      return {
        view_type: 'monthly',
        source: 'report_snapshot',
        snapshot_settings: {
          view_type: 'monthly',
          month_period: selectedMonth,
          window_size: monthlyWindow,
        },
        metrics: {
          gmv: Number(latest.gmv ?? 0),
          conversions: Number(latest.conversions ?? 0),
          profit: Number(latest.profit ?? 0),
          roi: Number(latest.roi ?? 0),
          impressions: Number(latest.impressions ?? 0),
          clicks: Number(latest.clicks ?? 0),
          ctr: Number(latest.ctr ?? 0),
          cvr: Number(latest.cvr ?? 0),
          validation_rate: Number(latest.validation_rate ?? 0),
        },
        coverage: {
          percentage: 0,
          products_with_ads: 0,
          total_products: 0,
        },
        history: ordered,
        comparisons,
        last_updated: periodStart,
      }
    }

    const keywordFallback = await query(
      `SELECT range_start AS period_start,
              total_impressions AS impressions,
              total_clicks AS clicks,
              total_conversions AS conversions,
              overall_ctr AS ctr,
              overall_cvr AS cvr,
              last_updated
       FROM keywords_snapshots
       WHERE retailer_id = $1
         AND range_type = 'month'
         AND range_start <= $2::date
       ORDER BY range_start DESC
       LIMIT $3`,
      [retailerId, periodStartDate, monthlyWindow]
    )

    if (keywordFallback.rows.length === 0) {
      return null
    }

    const ordered = [...keywordFallback.rows].reverse()
    const latest = keywordFallback.rows[0] as Record<string, number>
    const previous = keywordFallback.rows[1] as Record<string, number> | undefined

    return {
      view_type: 'monthly',
      source: 'report_snapshot',
      snapshot_settings: {
        view_type: 'monthly',
        month_period: selectedMonth,
        window_size: monthlyWindow,
      },
      metrics: {
        gmv: 0,
        conversions: Number(latest.conversions ?? 0),
        profit: 0,
        roi: 0,
        impressions: Number(latest.impressions ?? 0),
        clicks: Number(latest.clicks ?? 0),
        ctr: Number(latest.ctr ?? 0),
        cvr: Number(latest.cvr ?? 0),
        validation_rate: 0,
      },
      coverage: {
        percentage: 0,
        products_with_ads: 0,
        total_products: 0,
      },
      history: ordered.map((row: Record<string, unknown>) => ({
        period_start: row.period_start,
        gmv: 0,
        conversions: Number(row.conversions ?? 0),
        profit: 0,
        roi: 0,
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        ctr: Number(row.ctr ?? 0),
        cvr: Number(row.cvr ?? 0),
      })),
      comparisons: {
        gmv_change_pct: null,
        conversions_change_pct: calculatePercentageChange(Number(latest.conversions ?? 0), previous ? Number(previous.conversions ?? 0) : null),
        roi_change_pct: null,
      },
      last_updated: keywordFallback.rows[0].last_updated ?? periodStart,
    }
  }

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
      performanceTable = await buildOverviewSnapshot()
      break
  }

  return {
    performanceTable,
    domainMetricsData: Object.keys(domainMetricsData).length > 0 ? domainMetricsData : null,
  }
}
