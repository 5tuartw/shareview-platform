import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, hasRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import { parsePeriodParam } from '@/lib/analytics-utils'

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { retailer_id, period, title } = body

    if (!retailer_id || !period) {
      return NextResponse.json(
        { error: 'Missing required fields: retailer_id, period' },
        { status: 400 }
      )
    }

    if (!canAccessRetailer(session, retailer_id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    // Verify user has a client role
    if (!hasRole(session, ['CLIENT_VIEWER', 'CLIENT_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Only clients can request reports. Staff should use POST /api/reports' },
        { status: 403 }
      )
    }

    // Check if report requests are enabled for this retailer
    const configResult = await query<{ features_enabled: Record<string, unknown> }>(
      `SELECT features_enabled FROM retailer_config WHERE retailer_id = $1`,
      [retailer_id]
    )

    const featuresEnabled = configResult.rows.length > 0 ? configResult.rows[0].features_enabled : {}
    const allowReportRequest = (featuresEnabled?.allow_report_request as boolean) ?? false

    if (!allowReportRequest) {
      return NextResponse.json(
        { error: 'Report requests are not enabled for this retailer' },
        { status: 403 }
      )
    }

    // Parse period to get start and end dates
    const { periodStart, periodEnd } = parsePeriodParam(period)

    // Create report with client_requested status
    const result = await query(
      `INSERT INTO reports 
        (retailer_id, period_start, period_end, period_type, title, 
         status, report_type, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'month', $4, 'pending_approval', 'client_requested', false, $5, NOW(), NOW())
       RETURNING *`,
      [retailer_id, periodStart, periodEnd, title || null, session.user.id]
    )

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error requesting report:', error)
    return NextResponse.json(
      {
        error: 'Failed to request report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
