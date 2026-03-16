// services/reports/create-report.ts
import { query, transaction } from '@/lib/db'
import { buildInsightsForPeriod, insertAIInsights } from '../ai-insights-generator/generate-ai-insights'
import { captureSnapshotForDomain, captureVisibilityConfig } from './capture-snapshot'
import type { CapturedDomainData } from './capture-snapshot'
import type { VisibilityConfig } from './capture-snapshot'
import type { PoolClient } from 'pg'

// Domains supported by the report_domains constraint.
// 'coverage' was removed from the platform; filter it out wherever it lingers in DB config.
const VALID_REPORT_DOMAINS = new Set(['overview', 'keywords', 'categories', 'products', 'auctions'])

interface CreateReportParams {
  retailerId: string
  periodStart: string
  periodEnd: string
  periodType: string
  title?: string
  description?: string
  domains: string[]
  autoApprove: boolean
  reportType?: string
  hiddenFromRetailer?: boolean
  includeInsights?: boolean
  insightsRequireApproval?: boolean
  visibilityConfigOverride?: VisibilityConfig
  overviewSnapshotConfig?: {
    view_type: 'monthly' | 'weekly'
    month_period: string
    week_period?: string
    monthly_window: number
    weekly_window: number
  }
  dbClient?: PoolClient
}

interface ReportRecord {
  id: number
  retailer_id: string
  period_start: string
  period_end: string
  period_type: string
  status: string
  report_type: string
  title: string | null
  description: string | null
  is_active: boolean
  auto_approve: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

interface SavedMarketComparisonGraph {
  id: number
  name: string
  metric: string
  view_type: 'monthly' | 'weekly'
  period_start: string
  period_end: string
  include_provisional: boolean
  match_mode: 'all' | 'any'
  domain_match_modes: Record<string, 'all' | 'any'>
  filters: Record<string, string[]>
  position: number
}

export async function createReport(
  params: CreateReportParams,
  userId: number
): Promise<ReportRecord> {
  const {
    retailerId,
    periodStart,
    periodEnd,
    periodType,
    title,
    description,
    domains: rawDomains,
    autoApprove,
    reportType,
    hiddenFromRetailer,
    includeInsights = true, // Default to true for backward compatibility
    insightsRequireApproval = true,
    visibilityConfigOverride,
    overviewSnapshotConfig,
    dbClient,
  } = params

  // Strip any domains that no longer exist in the platform (e.g. 'coverage' was removed)
  const domains = rawDomains.filter(d => VALID_REPORT_DOMAINS.has(d))

  try {
    // Pre-capture visibility config and domain snapshots outside the transaction
    // (captureSnapshotForDomain / captureVisibilityConfig use module-level query(),
    // not a transaction client)
    // Pass selected domains so only chosen tabs are frozen into visibility_config.
    const visibilityConfigSource = visibilityConfigOverride ?? await captureVisibilityConfig(retailerId, domains)
    const visibilityConfig: VisibilityConfig = {
      ...visibilityConfigSource,
      visible_tabs: (visibilityConfigSource.visible_tabs ?? []).filter((tab) => domains.includes(tab)),
    }

    const domainSnapshots = new Map<string, CapturedDomainData>()

    let savedMarketComparisonGraphs: SavedMarketComparisonGraph[] = []
    try {
      const savedGraphResult = await query<SavedMarketComparisonGraph>(
        `SELECT id, name, metric, view_type,
                period_start::text, period_end::text,
          include_provisional, match_mode, domain_match_modes, filters, position
         FROM overview_market_comparison_graphs
         WHERE retailer_id = $1
           AND scope = 'overview'
           AND is_active = true
         ORDER BY position ASC, created_at ASC`,
        [retailerId]
      )
      savedMarketComparisonGraphs = savedGraphResult.rows
    } catch (error) {
      const pgError = error as { code?: string }
      if (pgError.code !== '42P01' && pgError.code !== '42703') {
        throw error
      }
      savedMarketComparisonGraphs = []
    }

    for (const domain of domains) {
      const captured = await captureSnapshotForDomain(
        retailerId,
        domain,
        periodStart,
        periodEnd,
        domain === 'overview' ? overviewSnapshotConfig : undefined
      )

      if (domain === 'overview') {
        const overviewBase = (captured.performanceTable ?? {}) as Record<string, unknown>
        captured.performanceTable = {
          ...overviewBase,
          market_comparison_saved_graphs: savedMarketComparisonGraphs,
        }
      }

      domainSnapshots.set(domain, captured)
    }

    const persistWithClient = async (client: PoolClient): Promise<ReportRecord> => {
      // 1. INSERT INTO reports
      const reportResult = await client.query<ReportRecord>(
        `INSERT INTO reports 
          (retailer_id, period_start, period_end, period_type, title, description,
           status, report_type, is_active, auto_approve, hidden_from_retailer,
           include_insights, insights_require_approval, visibility_config, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, false, $8, $9, $10, $11, $12, $13, NOW(), NOW())
         RETURNING *`,
        [
          retailerId, 
          periodStart, 
          periodEnd, 
          periodType, 
          title || null, 
          description || null, 
          reportType || 'manual',
          autoApprove, 
          hiddenFromRetailer ?? false,
          includeInsights,
          insightsRequireApproval,
          JSON.stringify(visibilityConfig),
          userId
        ]
      )

      const reportId = reportResult.rows[0].id

      // 2. INSERT INTO report_domains for each domain (with frozen snapshot data)
      for (const domain of domains) {
        const snap = domainSnapshots.get(domain)
        await client.query(
          `INSERT INTO report_domains (report_id, domain, performance_table, domain_metrics_data, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            reportId,
            domain,
            snap?.performanceTable ? JSON.stringify(snap.performanceTable) : null,
            snap?.domainMetricsData ? JSON.stringify(snap.domainMetricsData) : null,
          ]
        )
      }

      // 3. Generate and insert AI insights for each domain (only if includeInsights is true)
      if (includeInsights) {
        for (const domain of domains) {
          // Build insights for this domain
          const result = await buildInsightsForPeriod(
            retailerId,
            periodStart,
            periodEnd,
            domain,
            'insights'
          )

          // Insert AI insights
          if (result.insights.length > 0) {
            await insertAIInsights(client, result.insights)

            // 4. Update report_domains with ai_insight_id for insight_panel type
            const insightPanelResult = await client.query(
              `SELECT id FROM ai_insights
               WHERE retailer_id = $1
                 AND page_type = $2
                 AND tab_name = 'insights'
                 AND period_start = $3
                 AND period_end = $4
                 AND insight_type = 'insight_panel'
               ORDER BY created_at DESC
               LIMIT 1`,
              [retailerId, domain, periodStart, periodEnd]
            )

            if (insightPanelResult.rows.length > 0) {
              const insightId = insightPanelResult.rows[0].id
              await client.query(
                `UPDATE report_domains 
                 SET ai_insight_id = $1
                 WHERE report_id = $2 AND domain = $3`,
                [insightId, reportId, domain]
              )
            }
          }
        }
      }

      // 5. Handle auto-approve
      if (autoApprove) {
        // Update all AI insights to approved and active (if insights were generated)
        if (includeInsights) {
          await client.query(
            `UPDATE ai_insights
             SET status = 'approved', is_active = true, updated_at = NOW()
             WHERE retailer_id = $1
               AND period_start = $2
               AND period_end = $3
               AND page_type = ANY($4::text[])`,
            [retailerId, periodStart, periodEnd, domains]
          )
        }

        // Update report to published
        await client.query(
          `UPDATE reports
           SET status = 'published', is_active = true, updated_at = NOW()
           WHERE id = $1`,
          [reportId]
        )
      } else {
        // Set report to pending_approval
        await client.query(
          `UPDATE reports
           SET status = 'pending_approval', updated_at = NOW()
           WHERE id = $1`,
          [reportId]
        )
      }

      // Fetch and return the updated report
      const finalReportResult = await client.query<ReportRecord>(
        `SELECT * FROM reports WHERE id = $1`,
        [reportId]
      )

      return finalReportResult.rows[0]
    }

    const report = dbClient
      ? await persistWithClient(dbClient)
      : await transaction<ReportRecord>(persistWithClient)

    return report
  } catch (error) {
    console.error('Error creating report:', error)
    throw error
  }
}
