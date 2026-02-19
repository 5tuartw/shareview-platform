import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'
import { ReportListItem, CreateReportRequest } from '@/types'

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

    const { retailer_id, period_start, period_end, period_type, title, description } = body

    if (!retailer_id || !period_start || !period_end || !period_type) {
      return NextResponse.json(
        { error: 'Missing required fields: retailer_id, period_start, period_end, period_type' },
        { status: 400 }
      )
    }

    const result = await query(
      `INSERT INTO reports 
        (retailer_id, period_start, period_end, period_type, title, description, 
         status, report_type, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', 'manual', false, $7, NOW(), NOW())
       RETURNING *`,
      [retailer_id, period_start, period_end, period_type, title || null, description || null, session.user.id]
    )

    return NextResponse.json(result.rows[0])
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
