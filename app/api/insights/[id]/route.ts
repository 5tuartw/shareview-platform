import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to manage insights' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    const result = await query(
      `SELECT id, retailer_id, page_type, tab_name, period_start, period_end,
              insight_type, insight_data, status, is_active,
              approved_by, approved_at, published_by, published_at,
              review_notes, created_at, updated_at
       FROM ai_insights
       WHERE id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching insight:', error)
    return NextResponse.json(
      { error: 'Failed to fetch insight' },
      { status: 500 }
    )
  }
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to manage insights' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const body = await request.json()

    const { insight_data, status } = body

    if (!insight_data) {
      return NextResponse.json(
        { error: 'insight_data is required' },
        { status: 400 }
      )
    }

    const allowedStatuses = ['draft', 'pending']
    const newStatus = status && allowedStatuses.includes(status) ? status : 'draft'

    const result = await query(
      `UPDATE ai_insights
       SET insight_data = $1,
           status = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, status, insight_data, updated_at`,
      [JSON.stringify(insight_data), newStatus, id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error updating insight:', error)
    return NextResponse.json(
      { error: 'Failed to update insight' },
      { status: 500 }
    )
  }
}