// services/reports/publish-report.ts
import { query, transaction } from '@/lib/db'
import type { PoolClient } from 'pg'

interface ReportRecord {
  id: number
  retailer_id: string
  period_start: string
  period_end: string
  status: string
  is_active: boolean
  published_by: number | null
  published_at: string | null
}

export async function publishReport(
  reportId: number,
  publishedBy: number
): Promise<ReportRecord> {
  // 1. Fetch the report record
  const reportResult = await query<ReportRecord>(
    `SELECT * FROM reports WHERE id = $1`,
    [reportId]
  )

  if (reportResult.rows.length === 0) {
    throw new Error('Report not found')
  }

  const report = reportResult.rows[0]

  if (report.is_active) {
    throw new Error('Report is already published')
  }

  // 2. Fetch all report_domains rows for reportId
  const domainsResult = await query<{ domain: string }>(
    `SELECT domain FROM report_domains WHERE report_id = $1`,
    [reportId]
  )

  const domains = domainsResult.rows.map((row) => row.domain)

  if (domains.length === 0) {
    throw new Error('Report has no domains configured')
  }

  // 3. Query ai_insights for all linked insights
  const insightsResult = await query<{ insight_type: string; status: string; page_type: string }>(
    `SELECT insight_type, status, page_type
     FROM ai_insights
     WHERE retailer_id = $1
       AND period_start = $2
       AND period_end = $3
       AND page_type = ANY($4::text[])`,
    [report.retailer_id, report.period_start, report.period_end, domains]
  )

  // 4. Verify every linked insight has status='approved'
  for (const insight of insightsResult.rows) {
    if (insight.status !== 'approved') {
      throw new Error(
        `Cannot publish: insights for domain '${insight.page_type}' (type: ${insight.insight_type}) are not yet approved`
      )
    }
  }

  // 5. Open transaction and update
  const updatedReport = await transaction<ReportRecord>(async (client: PoolClient) => {
    // Update ai_insights to is_active=true
    await client.query(
      `UPDATE ai_insights
       SET is_active = true, updated_at = NOW()
       WHERE retailer_id = $1
         AND period_start = $2
         AND period_end = $3
         AND page_type = ANY($4::text[])`,
      [report.retailer_id, report.period_start, report.period_end, domains]
    )

    // Update reports to published
    const updateResult = await client.query<ReportRecord>(
      `UPDATE reports
       SET status = 'published',
           is_active = true,
           published_by = $1,
           published_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [publishedBy, reportId]
    )

    return updateResult.rows[0]
  })

  return updatedReport
}
