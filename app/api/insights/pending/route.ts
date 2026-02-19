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
      `SELECT ai.id, ai.retailer_id, ai.page_type, ai.tab_name, ai.period_start, ai.period_end,
              ai.insight_type, ai.insight_data, ai.status, ai.is_active,
              ai.approved_by, ai.approved_at, ai.published_by, ai.published_at, ai.created_at,
              rd.report_id
       FROM ai_insights ai
       LEFT JOIN report_domains rd ON rd.ai_insight_id = ai.id
       ${whereConditions}
       ORDER BY ai.created_at DESC`,
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
