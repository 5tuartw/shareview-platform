import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getRetailerOverview } from '@/services/retailer/overview'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string; id: string }> }
) {
  try {
    const { token, id } = await context.params

    const tokenResult = await query<{
      retailer_id: string
      expires_at: string | null
      password_hash: string | null
      report_id: number | null
    }>(
      `SELECT retailer_id, expires_at, password_hash, report_id
       FROM retailer_access_tokens
       WHERE token = $1 AND is_active = true`,
      [token]
    )

    if (tokenResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    const tokenData = tokenResult.rows[0]

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 404 })
    }

    if (tokenData.password_hash) {
      const cookieName = `sv_access_${token}`
      const cookieValue = request.cookies.get(cookieName)
      if (!cookieValue || cookieValue.value !== '1') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const reportId = Number.parseInt(id, 10)
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
    }

    if (tokenData.report_id !== null && tokenData.report_id !== reportId) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const reportResult = await query<{
      retailer_id: string
      period_start: string
      status: string
      hidden_from_retailer: boolean
    }>(
      `SELECT retailer_id, period_start, status, hidden_from_retailer
       FROM reports
       WHERE id = $1`,
      [reportId]
    )

    if (reportResult.rows.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const report = reportResult.rows[0]
    if (report.retailer_id !== tokenData.retailer_id) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    if (report.status !== 'published' || report.hidden_from_retailer) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const domainResult = await query<{ performance_table: Record<string, unknown> | null }>(
      `SELECT performance_table
       FROM report_domains
       WHERE report_id = $1
         AND domain = 'overview'
       LIMIT 1`,
      [reportId]
    )

    const frozenOverview = domainResult.rows[0]?.performance_table
    if (frozenOverview) {
      return NextResponse.json(frozenOverview)
    }

    // Backward compatibility for reports created before overview snapshot capture.
    const params = new URLSearchParams()
    params.set('view_type', 'monthly')
    params.set('period', report.period_start.slice(0, 7))
    const fallback = await getRetailerOverview(report.retailer_id, params)
    return NextResponse.json(fallback.data, { status: fallback.status })
  } catch (error) {
    console.error('Error loading access report overview snapshot:', error)
    return NextResponse.json({ error: 'Failed to load report overview snapshot' }, { status: 500 })
  }
}
