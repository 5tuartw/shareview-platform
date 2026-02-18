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

    const { searchParams } = new URL(request.url)
    const retailerId = searchParams.get('retailerId')
    const pageType = searchParams.get('pageType')
    const status = searchParams.get('status') || 'pending'

    const params: any[] = [status]
    let whereConditions = 'WHERE status = $1'

    if (retailerId) {
      params.push(retailerId)
      whereConditions += ` AND retailer_id = $${params.length}`
    }

    if (pageType) {
      params.push(pageType)
      whereConditions += ` AND page_type = $${params.length}`
    }

    const result = await query(
      `SELECT id, retailer_id, page_type, tab_name, period_start, period_end,
              insight_type, insight_data, status, is_active,
              approved_by, approved_at, created_at
       FROM ai_insights
       ${whereConditions}
       ORDER BY created_at DESC`,
      params
    )

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching pending insights:', error)
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    )
  }
}
