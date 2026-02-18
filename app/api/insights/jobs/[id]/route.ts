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
      `SELECT id, retailer_id, page_type, tab_name, period_type, period_start, period_end,
              status, started_at, completed_at, error_message, created_at
       FROM insights_generation_jobs
       WHERE id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching job:', error)
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    )
  }
}
