import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import { getRetailerOverview } from '@/services/retailer/overview'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params

    const reportResult = await query<{
      id: number
      retailer_id: string
      period_start: string
      period_end: string
      period_type: string
      status: string
      is_active: boolean
    }>(
      `SELECT id, retailer_id, period_start, period_end, period_type, status, is_active
       FROM reports
       WHERE id = $1`,
      [id]
    )

    if (reportResult.rows.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const report = reportResult.rows[0]

    if (!canAccessRetailer(session, report.retailer_id)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const domainResult = await query<{ performance_table: Record<string, unknown> | null }>(
      `SELECT performance_table
       FROM report_domains
       WHERE report_id = $1
         AND domain = 'overview'
       LIMIT 1`,
      [id]
    )

    const frozenOverview = domainResult.rows[0]?.performance_table
    if (frozenOverview) {
      return NextResponse.json(frozenOverview)
    }

    // Backward compatibility for older reports created before overview snapshot capture.
    const params = new URLSearchParams()
    params.set('view_type', 'monthly')
    params.set('period', report.period_start.slice(0, 7))
    const fallback = await getRetailerOverview(report.retailer_id, params)
    return NextResponse.json(fallback.data, { status: fallback.status })
  } catch (error) {
    console.error('Error loading report overview snapshot:', error)
    return NextResponse.json(
      { error: 'Failed to load report overview snapshot' },
      { status: 500 }
    )
  }
}
