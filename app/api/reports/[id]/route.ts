import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'
import { ReportDetail } from '@/types'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params

    // Fetch report
    const reportResult = await query<ReportDetail>(
      `SELECT * FROM reports WHERE id = $1`,
      [id]
    )

    if (reportResult.rows.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const report = reportResult.rows[0]

    // Check access
    if (!canAccessRetailer(session, report.retailer_id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    // For clients, check if report is published
    if (!canManageInsights(session) && !report.is_active) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Fetch retailer config for showAIDisclaimer flag
    const configResult = await query<{ features_enabled: Record<string, unknown> }>(
      `SELECT features_enabled FROM retailer_config WHERE retailer_id = $1`,
      [report.retailer_id]
    )
    const featuresEnabled = configResult.rows.length > 0 ? configResult.rows[0].features_enabled : {}
    const showAIDisclaimer = (featuresEnabled?.show_ai_disclaimer as boolean) ?? false

    // Fetch report domains
    const domainsResult = await query(
      `SELECT domain
       FROM report_domains
       WHERE report_id = $1
       ORDER BY domain`,
      [id]
    )

    // Fetch performance table data for each domain
    const domains = await Promise.all(
      domainsResult.rows.map(async (row) => {
        let performanceTable = null
        let domainMetrics = null

        const { retailer_id, period_start, period_end } = report

        // Query domain_metrics for this domain
        const metricsResult = await query(
          `SELECT component_type, component_data
           FROM domain_metrics
           WHERE retailer_id = $1
             AND page_type = $2
             AND period_start = $3
             AND period_end = $4
             AND is_active = true`,
          [retailer_id, row.domain, period_start, period_end]
        )

        domainMetrics = metricsResult.rows.reduce((acc, m) => {
          if (m.component_type === 'metric_card') {
            if (!acc.metricCards) acc.metricCards = []
            acc.metricCards.push(m.component_data)
          } else {
            acc[m.component_type] = m.component_data
          }
          return acc
        }, {} as Record<string, unknown>)

        // Query all published AI insights for this domain
        const aiInsightsResult = await query(
          `SELECT insight_type, insight_data
           FROM ai_insights
           WHERE retailer_id = $1
             AND page_type = $2
             AND period_start = $3
             AND period_end = $4
             AND is_active = true`,
          [retailer_id, row.domain, period_start, period_end]
        )

        const aiInsights = {
          insightsPanel: null as Record<string, unknown> | null,
          marketAnalysis: null as Record<string, unknown> | null,
          recommendation: null as Record<string, unknown> | null,
          showAIDisclaimer,
        }

        for (const insight of aiInsightsResult.rows) {
          switch (insight.insight_type) {
            case 'insight_panel':
              aiInsights.insightsPanel = insight.insight_data as Record<string, unknown>
              break
            case 'market_analysis':
              aiInsights.marketAnalysis = insight.insight_data as Record<string, unknown>
              break
            case 'recommendation':
              aiInsights.recommendation = insight.insight_data as Record<string, unknown>
              break
          }
        }

        // Query relevant snapshot table based on domain
        switch (row.domain) {
          case 'keywords':
            const keywordsSnapshot = await query(
              `SELECT top_keywords, bottom_keywords, total_keywords, total_impressions, 
                      total_clicks, total_conversions, overall_ctr, overall_cvr,
                      tier_star_count, tier_strong_count, tier_underperforming_count, tier_poor_count
               FROM keywords_snapshots
               WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3
               ORDER BY snapshot_date DESC LIMIT 1`,
              [retailer_id, period_start, period_end]
            )
            performanceTable = keywordsSnapshot.rows[0] || null
            break

          case 'categories':
            const categoriesSnapshot = await query(
              `SELECT categories, health_summary, total_categories, total_impressions,
                      total_clicks, total_conversions, overall_ctr, overall_cvr,
                      health_broken_count, health_underperforming_count, health_attention_count,
                      health_healthy_count, health_star_count
               FROM category_performance_snapshots
               WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3
               ORDER BY snapshot_date DESC LIMIT 1`,
              [retailer_id, period_start, period_end]
            )
            performanceTable = categoriesSnapshot.rows[0] || null
            break

          case 'products':
            const productsSnapshot = await query(
              `SELECT top_performers, underperformers, total_products, total_conversions,
                      avg_ctr, avg_cvr, star_count, good_count, underperformer_count,
                      top_1_pct_products, top_1_pct_conversions_share,
                      products_with_wasted_clicks, total_wasted_clicks, wasted_clicks_percentage
               FROM product_performance_snapshots
               WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3
               ORDER BY snapshot_date DESC LIMIT 1`,
              [retailer_id, period_start, period_end]
            )
            performanceTable = productsSnapshot.rows[0] || null
            break

          case 'auctions':
            const auctionSnapshot = await query(
              `SELECT competitors, avg_impression_share, total_competitors, avg_overlap_rate,
                      avg_outranking_share, avg_being_outranked,
                      top_competitor_id, top_competitor_overlap_rate, top_competitor_outranking_you,
                      biggest_threat_id, biggest_threat_overlap_rate, biggest_threat_outranking_you,
                      best_opportunity_id, best_opportunity_overlap_rate, best_opportunity_you_outranking
               FROM auction_insights_snapshots
               WHERE retailer_id = $1 AND range_start = $2 AND range_end = $3
               ORDER BY snapshot_date DESC LIMIT 1`,
              [retailer_id, period_start, period_end]
            )
            performanceTable = auctionSnapshot.rows[0] || null
            break

          case 'overview':
            // Overview doesn't have a specific snapshot table, use domain_metrics only
            break
        }

        return {
          domain: row.domain,
          performance_table: performanceTable,
          domain_metrics: domainMetrics,
          ai_insights: aiInsights,
        }
      })
    )

    const reportDetail: ReportDetail = {
      ...report,
      domains,
    }

    return NextResponse.json(reportDetail)
  } catch (error) {
    console.error('Error fetching report:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
