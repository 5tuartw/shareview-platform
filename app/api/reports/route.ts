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
        `SELECT 
           r.id, 
           r.retailer_id, 
           COALESCE(rm.retailer_name, r.retailer_id) as retailer_name,
           r.period_start, 
           r.period_end, 
           r.period_type, 
           r.status, 
           r.report_type, 
           r.title, 
           r.is_active, 
           r.hidden_from_retailer,
           r.created_at, 
           r.created_by,
           COALESCE(
             ARRAY_AGG(rd.domain ORDER BY rd.domain) FILTER (WHERE rd.domain IS NOT NULL),
             '{}'
           ) as domains
         FROM reports r
         LEFT JOIN (
           SELECT DISTINCT retailer_id, retailer_name 
           FROM retailer_metrics 
           WHERE (retailer_id, fetch_datetime) IN (
             SELECT retailer_id, MAX(fetch_datetime) 
             FROM retailer_metrics 
             GROUP BY retailer_id
           )
         ) rm ON r.retailer_id = rm.retailer_id
         LEFT JOIN report_domains rd ON r.id = rd.report_id
         WHERE r.retailer_id = $1
         GROUP BY r.id, r.retailer_id, rm.retailer_name, r.period_start, r.period_end, 
                  r.period_type, r.status, r.report_type, r.title, r.is_active, r.hidden_from_retailer, 
                  r.created_at, r.created_by
         ORDER BY r.created_at DESC`,
        [retailerId]
      )
    } else {
      result = await query<ReportListItem>(
        `SELECT 
           r.id, 
           r.retailer_id, 
           COALESCE(rm.retailer_name, r.retailer_id) as retailer_name,
           r.period_start, 
           r.period_end, 
           r.period_type, 
           r.status, 
           r.report_type, 
           r.title, 
           r.is_active, 
           r.hidden_from_retailer,
           r.created_at, 
           r.created_by,
           COALESCE(
             ARRAY_AGG(rd.domain ORDER BY rd.domain) FILTER (WHERE rd.domain IS NOT NULL),
             '{}'
           ) as domains
         FROM reports r
         LEFT JOIN (
           SELECT DISTINCT retailer_id, retailer_name 
           FROM retailer_metrics 
           WHERE (retailer_id, fetch_datetime) IN (
             SELECT retailer_id, MAX(fetch_datetime) 
             FROM retailer_metrics 
             GROUP BY retailer_id
           )
         ) rm ON r.retailer_id = rm.retailer_id
         LEFT JOIN report_domains rd ON r.id = rd.report_id
         WHERE r.retailer_id = $1 AND r.is_active = true AND r.hidden_from_retailer = false
         GROUP BY r.id, r.retailer_id, rm.retailer_name, r.period_start, r.period_end, 
                  r.period_type, r.status, r.report_type, r.title, r.is_active, r.hidden_from_retailer, 
                  r.created_at, r.created_by
         ORDER BY r.created_at DESC`,
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

    if (!session?.user || !canManageInsights(session)) {
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
