import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasRole, canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import type { ReportSchedule } from '@/types'

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly']

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    // Check retailer access
    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const result = await query<ReportSchedule>(
      'SELECT * FROM report_schedules WHERE retailer_id = $1',
      [id]
    )

    return NextResponse.json(result.rows.length > 0 ? result.rows[0] : null)
  } catch (error) {
    console.error('Error fetching report schedule:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch report schedule',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    // Check retailer access
    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const { frequency, run_day, report_period, domains, is_active } = body

    if (!frequency || !VALID_FREQUENCIES.includes(frequency)) {
      return NextResponse.json(
        { error: 'Invalid frequency. Must be one of: daily, weekly, monthly, quarterly' },
        { status: 400 }
      )
    }

    const result = await query<ReportSchedule>(
      `INSERT INTO report_schedules 
        (retailer_id, frequency, run_day, report_period, domains, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (retailer_id) 
       DO UPDATE SET 
         frequency = EXCLUDED.frequency,
         run_day = EXCLUDED.run_day,
         report_period = EXCLUDED.report_period,
         domains = EXCLUDED.domains,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        frequency,
        run_day ?? null,
        report_period ?? null,
        domains ?? [],
        is_active ?? true,
        parseInt(session.user.id),
      ]
    )

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error saving report schedule:', error)
    return NextResponse.json(
      {
        error: 'Failed to save report schedule',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
