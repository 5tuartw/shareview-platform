import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to manage insights' },
        { status: 403 }
      )
    }

    const result = await query(
      `SELECT id, retailer_id, page_type, tab_name, period_type, period_start, period_end,
              status, started_at, completed_at, error_message, created_at
       FROM insights_generation_jobs
       ORDER BY created_at DESC
       LIMIT 20`
    )

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    )
  }
}
