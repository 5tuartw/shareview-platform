// services/reports/create-report.ts
import { transaction } from '@/lib/db'
import { buildInsightsForPeriod, insertAIInsights } from '../ai-insights-generator/generate-ai-insights'
import type { PoolClient } from 'pg'

interface CreateReportParams {
  retailerId: string
  periodStart: string
  periodEnd: string
  periodType: string
  title?: string
  description?: string
  domains: string[]
  autoApprove: boolean
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
    domains,
    autoApprove,
  } = params

  try {
    const report = await transaction<ReportRecord>(async (client: PoolClient) => {
      // 1. INSERT INTO reports
      const reportResult = await client.query<ReportRecord>(
        `INSERT INTO reports 
          (retailer_id, period_start, period_end, period_type, title, description,
           status, report_type, is_active, auto_approve, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', 'manual', false, $7, $8, NOW(), NOW())
         RETURNING *`,
        [retailerId, periodStart, periodEnd, periodType, title || null, description || null, autoApprove, userId]
      )

      const reportId = reportResult.rows[0].id

      // 2. INSERT INTO report_domains for each domain
      for (const domain of domains) {
        await client.query(
          `INSERT INTO report_domains (report_id, domain, created_at)
           VALUES ($1, $2, NOW())`,
          [reportId, domain]
        )
      }

      // 3. Generate and insert AI insights for each domain
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

      // 5. Handle auto-approve
      if (autoApprove) {
        // Update all AI insights to approved and active
        await client.query(
          `UPDATE ai_insights
           SET status = 'approved', is_active = true, updated_at = NOW()
           WHERE retailer_id = $1
             AND period_start = $2
             AND period_end = $3
             AND page_type = ANY($4::text[])`,
          [retailerId, periodStart, periodEnd, domains]
        )

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
    })

    return report
  } catch (error) {
    console.error('Error creating report:', error)
    throw error
  }
}
