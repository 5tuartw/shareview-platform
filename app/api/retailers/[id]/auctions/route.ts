import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import type { CompetitorDetail } from '@/lib/api-client'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'No access to this retailer' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    let period = searchParams.get('period') // YYYY-MM

    // Fall back to latest month
    if (!period) {
      const latestResult = await query<{ month: string }>(
        `SELECT to_char(MAX(month), 'YYYY-MM') AS month
         FROM auction_insights
         WHERE retailer_id = $1`,
        [retailerId],
      )
      period = latestResult.rows[0]?.month ?? null
    }

    if (!period) {
      return NextResponse.json(
        { error: 'No auction data available for this retailer' },
        { status: 404 },
      )
    }

    const monthDate = `${period}-01`
    const [y, m] = period.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()

    const result = await query<{
      shop_display_name: string
      is_self: boolean
      impr_share: string | null
      impr_share_is_estimate: boolean
      outranking_share: string | null
      overlap_rate: string | null
    }>(
      `SELECT
         shop_display_name,
         bool_or(is_self) AS is_self,
         AVG(impr_share::numeric)::text AS impr_share,
         bool_or(impr_share_is_estimate) AS impr_share_is_estimate,
         AVG(outranking_share::numeric)::text AS outranking_share,
         AVG(overlap_rate::numeric)::text AS overlap_rate
       FROM auction_insights
       WHERE retailer_id = $1
         AND month = $2::date
         AND preferred_for_display = true
       GROUP BY shop_display_name
       ORDER BY bool_or(is_self) DESC, AVG(COALESCE(overlap_rate::numeric, 0)) DESC`,
      [retailerId, monthDate],
    )

    const toPercent = (v: string | null): number | null =>
      v != null ? parseFloat(v) * 100 : null

    const competitors: CompetitorDetail[] = result.rows.map(row => ({
      name: row.shop_display_name,
      is_shareight: row.is_self,
      days_seen: daysInMonth,
      avg_overlap_rate: toPercent(row.overlap_rate) ?? 0,
      avg_you_outranking: toPercent(row.outranking_share) ?? 0,
      avg_them_outranking: 0,  // not available from single-perspective export
      avg_their_impression_share: row.is_self ? null : toPercent(row.impr_share),
      impression_share_is_estimate: row.impr_share_is_estimate,
      max_overlap_rate: toPercent(row.overlap_rate) ?? 0,
      max_them_outranking: 0,
    }))

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'auctions-competitors', period },
    })

    return NextResponse.json(competitors)
  } catch (error) {
    console.error('Auction competitors error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
