import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'
import { ReportListItem, CreateReportRequest } from '@/types'
import { createReport } from '@/services/reports/create-report'

export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const retailerId = searchParams.get('retailerId')

    if (!retailerId) {
      return NextResponse.json(
        { error: 'Missing required parameter: retailerId' },
        { status: 400 }
      )
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    let result

    // Staff can see all reports, clients only see published ones
    if (canManageInsights(session)) {
      result = await query<ReportListItem>(
        `SELECT id, retailer_id, period_start, period_end, period_type, status, 
                report_type, title, is_active, created_at, created_by
         FROM reports
         WHERE retailer_id = $1
         ORDER BY created_at DESC`,
        [retailerId]
      )
    } else {
      result = await query<ReportListItem>(
        `SELECT id, retailer_id, period_start, period_end, period_type, status, 
                report_type, title, is_active, created_at, created_by
         FROM reports
         WHERE retailer_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [retailerId]
      )
    }

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch reports',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to create reports' },
        { status: 403 }
      )
    }

    const body: CreateReportRequest = await request.json()

    const { retailer_id, period_start, period_end, period_type, title, description, domains, auto_approve } = body

    if (!retailer_id || !period_start || !period_end || !period_type) {
      return NextResponse.json(
        { error: 'Missing required fields: retailer_id, period_start, period_end, period_type' },
        { status: 400 }
      )
    }

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: domains (must be a non-empty array)' },
        { status: 400 }
      )
    }

    const report = await createReport(
      {
        retailerId: retailer_id,
        periodStart: period_start,
        periodEnd: period_end,
        periodType: period_type,
        title,
        description,
        domains,
        autoApprove: auto_approve ?? false,
      },
      parseInt(session.user.id)
    )

    return NextResponse.json(report)
  } catch (error) {
    console.error('Error creating report:', error)
    return NextResponse.json(
      {
        error: 'Failed to create report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
