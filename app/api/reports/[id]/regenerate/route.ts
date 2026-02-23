import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'
import { createReport } from '@/services/reports/create-report'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to regenerate reports' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    // Fetch existing report
    const reportResult = await query(
      `SELECT retailer_id, period_start, period_end, period_type, title, 
              description, report_type, auto_approve, hidden_from_retailer 
       FROM reports WHERE id = $1`,
      [id]
    )

    if (reportResult.rows.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const existingReport = reportResult.rows[0]

    // Fetch domains from report_domains
    const domainsResult = await query(
      `SELECT domain FROM report_domains WHERE report_id = $1 ORDER BY domain`,
      [id]
    )

    const domains = domainsResult.rows.map((row) => row.domain)

    // Create new report using the same parameters, preserving metadata
    const newReport = await createReport(
      {
        retailerId: existingReport.retailer_id,
        periodStart: existingReport.period_start,
        periodEnd: existingReport.period_end,
        periodType: existingReport.period_type,
        title: existingReport.title || undefined,
        description: existingReport.description || undefined,
        domains,
        autoApprove: existingReport.auto_approve ?? false,
        reportType: existingReport.report_type,
        hiddenFromRetailer: existingReport.hidden_from_retailer ?? false,
      },
      parseInt(session.user.id)
    )

    return NextResponse.json(newReport)
  } catch (error) {
    console.error('Error regenerating report:', error)
    return NextResponse.json(
      {
        error: 'Failed to regenerate report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
