import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, canManageInsights } from '@/lib/permissions'
import { query, transaction } from '@/lib/db'
import { ReportDetail } from '@/types'
import { buildInsightsForPeriod, insertAIInsights } from '@/services/ai-insights-generator/generate-ai-insights'
import { generateSnapshots } from '@/services/snapshot-generator/generate-snapshots'

const ALLOWED_DOMAINS = ['overview', 'keywords', 'categories', 'products', 'auctions'] as const
type Domain = typeof ALLOWED_DOMAINS[number]

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

    const isStaff = canManageInsights(session)

    // Fetch performance table data for each domain
    const domains = await Promise.all(
      domainsResult.rows.map(async (row) => {
        let performanceTable = null
        let domainMetrics = null
        let insightStatus: string | null = null

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

        // For staff, fetch linked insight status
        if (isStaff) {
          const statusResult = await query(
            `SELECT ai.status
             FROM report_domains rd
             JOIN ai_insights ai ON rd.ai_insight_id = ai.id
             WHERE rd.report_id = $1 AND rd.domain = $2`,
            [id, row.domain]
          )
          if (statusResult.rows.length > 0) {
            insightStatus = statusResult.rows[0].status
          }
        }

        // Query all AI insights linked to this report domain via report_domains
        const aiInsightsResult = await query(
          `SELECT ai.insight_type, ai.insight_data
           FROM ai_insights ai
           JOIN report_domains rd ON ai.id = rd.ai_insight_id
           WHERE rd.report_id = $1
             AND rd.domain = $2`,
          [id, row.domain]
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
              `SELECT 
                 COUNT(*) as total_categories,
                 SUM(node_impressions) as total_impressions,
                 SUM(node_clicks) as total_clicks,
                 SUM(node_conversions) as total_conversions,
                 CASE 
                   WHEN SUM(node_impressions) > 0 
                   THEN (SUM(node_clicks)::numeric / SUM(node_impressions)::numeric)
                   ELSE 0 
                 END as overall_ctr,
                 CASE 
                   WHEN SUM(node_clicks) > 0 
                   THEN (SUM(node_conversions)::numeric / SUM(node_clicks)::numeric)
                   ELSE 0 
                 END as overall_cvr,
                 COUNT(*) FILTER (WHERE health_status = 'broken') as health_broken_count,
                 COUNT(*) FILTER (WHERE health_status = 'underperforming') as health_underperforming_count,
                 COUNT(*) FILTER (WHERE health_status = 'attention') as health_attention_count,
                 COUNT(*) FILTER (WHERE health_status = 'healthy') as health_healthy_count,
                 COUNT(*) FILTER (WHERE health_status = 'star') as health_star_count,
                 jsonb_build_object(
                   'broken', COUNT(*) FILTER (WHERE health_status = 'broken'),
                   'underperforming', COUNT(*) FILTER (WHERE health_status = 'underperforming'),
                   'attention', COUNT(*) FILTER (WHERE health_status = 'attention'),
                   'healthy', COUNT(*) FILTER (WHERE health_status = 'healthy'),
                   'star', COUNT(*) FILTER (WHERE health_status = 'star')
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
          ...(isStaff && { insight_status: insightStatus }),
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to update reports' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const body = await request.json()

    // Validate domains if provided
    if ('domains' in body) {
      if (!Array.isArray(body.domains) || body.domains.length === 0) {
        return NextResponse.json(
          { error: 'domains must be a non-empty array' },
          { status: 400 }
        )
      }
      const invalidDomains = (body.domains as string[]).filter(
        (d) => !ALLOWED_DOMAINS.includes(d as Domain)
      )
      if (invalidDomains.length > 0) {
        return NextResponse.json(
          {
            error: `Invalid domain(s): ${invalidDomains.join(', ')}. Allowed: ${ALLOWED_DOMAINS.join(', ')}`,
          },
          { status: 400 }
        )
      }
    }

    const allowedFields = ['title', 'status', 'hidden_from_retailer', 'is_archived', 'include_insights', 'insights_require_approval']
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = $${paramIndex}`)
        values.push(body[field])
        paramIndex++
      }
    }

    if (updates.length === 0 && !('domains' in body)) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Perform report update and domain sync in a single transaction
    let addedDomains: string[] = []
    let reportRow: Record<string, unknown>

    if (updates.length > 0) {
      // Add updated_at
      updates.push(`updated_at = NOW()`)
      values.push(id)

      const txResult = await transaction(async (client) => {
        const result = await client.query(
          `UPDATE reports SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        )

        if (result.rows.length === 0) {
          throw Object.assign(new Error('Report not found'), { statusCode: 404 })
        }

        const report = result.rows[0]

        if ('domains' in body) {
          const newDomains: string[] = body.domains
          const existingResult = await client.query(
            `SELECT domain FROM report_domains WHERE report_id = $1`,
            [id]
          )
          const existingDomains: string[] = existingResult.rows.map((r: { domain: string }) => r.domain)

          const toAdd = newDomains.filter((d) => !existingDomains.includes(d))
          const toRemove = existingDomains.filter((d) => !newDomains.includes(d))

          for (const domain of toAdd) {
            await client.query(
              `INSERT INTO report_domains (report_id, domain, created_at) VALUES ($1, $2, NOW())`,
              [id, domain]
            )
          }

          for (const domain of toRemove) {
            await client.query(
              `DELETE FROM report_domains WHERE report_id = $1 AND domain = $2`,
              [id, domain]
            )
          }

          addedDomains = toAdd
        }

        return report
      })

      reportRow = txResult
    } else {
      // domains-only update
      const existingReportResult = await query(
        `SELECT * FROM reports WHERE id = $1`,
        [id]
      )
      if (existingReportResult.rows.length === 0) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }
      reportRow = existingReportResult.rows[0]

      const newDomains: string[] = body.domains
      const existingResult = await query(
        `SELECT domain FROM report_domains WHERE report_id = $1`,
        [id]
      )
      const existingDomains: string[] = existingResult.rows.map((r: { domain: string }) => r.domain)

      const toAdd = newDomains.filter((d) => !existingDomains.includes(d))
      const toRemove = existingDomains.filter((d) => !newDomains.includes(d))

      await transaction(async (client) => {
        for (const domain of toAdd) {
          await client.query(
            `INSERT INTO report_domains (report_id, domain, created_at) VALUES ($1, $2, NOW())`,
            [id, domain]
          )
        }
        for (const domain of toRemove) {
          await client.query(
            `DELETE FROM report_domains WHERE report_id = $1 AND domain = $2`,
            [id, domain]
          )
        }
      })

      addedDomains = toAdd
    }

    // After successful sync, trigger background tasks for newly added domains
    if (addedDomains.length > 0) {
      const retailerId = reportRow.retailer_id as string
      const periodStart = reportRow.period_start as string
      const periodEnd = reportRow.period_end as string
      const includeInsights = (reportRow.include_insights as boolean) ?? false

      // Fire-and-forget: trigger snapshot generation for the retailer
      generateSnapshots({ retailer: retailerId }).catch((err) =>
        console.error('[PATCH report] Background snapshot generation failed:', err)
      )

      // Enqueue AI insight generation for newly added domains when include_insights is enabled
      if (includeInsights) {
        Promise.all(
          addedDomains.map(async (domain) => {
            try {
              const result = await buildInsightsForPeriod(
                retailerId,
                periodStart,
                periodEnd,
                domain,
                'insights'
              )
              if (result.insights.length > 0) {
                await transaction(async (client) => {
                  await insertAIInsights(client, result.insights)
                  // Link the insight_panel insight to the report_domain
                  const insightResult = await client.query(
                    `SELECT id FROM ai_insights
                     WHERE retailer_id = $1
                       AND period_start = $2
                       AND period_end = $3
                       AND insight_type = 'insight_panel'
                     ORDER BY created_at DESC
                     LIMIT 1`,
                    [retailerId, periodStart, periodEnd]
                  )
                  if (insightResult.rows.length > 0) {
                    await client.query(
                      `UPDATE report_domains
                       SET ai_insight_id = $1
                       WHERE report_id = $2 AND domain = $3`,
                      [insightResult.rows[0].id, id, domain]
                    )
                  }
                })
              }
            } catch (err) {
              console.error(
                `[PATCH report] AI insight generation failed for domain '${domain}':`,
                err
              )
            }
          })
        ).catch((err) =>
          console.error('[PATCH report] Background AI generation failed:', err)
        )
      }
    }

    return NextResponse.json(reportRow)
  } catch (error) {
    const customError = error as { statusCode?: number }
    if (customError.statusCode === 404) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    console.error('Error updating report:', error)
    return NextResponse.json(
      {
        error: 'Failed to update report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to delete reports' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    await query('DELETE FROM reports WHERE id = $1', [id])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error deleting report:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
