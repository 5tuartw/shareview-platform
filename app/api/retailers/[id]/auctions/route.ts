import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import type { CompetitorDetail } from '@/lib/api-client'
import { isDemoRetailer, sanitiseAuctionCompetitorRows } from '@/lib/demo-jargon-sanitizer'
import { AUCTION_QUADRANT_LABELS, classifyAuctionCompetitorQuadrant } from '@/lib/auction-quadrants'
import { fetchAuctionClassificationOverrideMap, fetchAuctionClassificationSettings } from '@/lib/auction-classification-config'

type SnapshotCompetitor = {
  id?: string
  name?: string
  competitor_name?: string
  overlap_rate?: number
  outranking_share?: number
  impression_share?: number
}

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

      if (!period) {
        const latestSnapshotResult = await query<{ month: string }>(
          `SELECT to_char(MAX(range_start), 'YYYY-MM') AS month
           FROM auction_insights_snapshots
           WHERE retailer_id = $1
             AND range_type = 'month'`,
          [retailerId],
        )
        period = latestSnapshotResult.rows[0]?.month ?? null
      }
    }

    if (!period) {
      return NextResponse.json(
        { error: 'No auction data available for this retailer' },
        { status: 404 },
      )
    }

    const monthDate = `${period}-01`
    const [y, m] = period.split('-').map(Number)
    const fallbackDaysInMonth = new Date(y, m, 0).getDate()

    const result = await query<{
      shop_display_name: string
      is_self: boolean
      impr_share: string | null
      impr_share_is_estimate: boolean
      outranking_share: string | null
      overlap_rate: string | null
      competitor_quadrant: string | null
    }>(
      `SELECT
         shop_display_name,
         bool_or(is_self) AS is_self,
         AVG(impr_share::numeric)::text AS impr_share,
         bool_or(impr_share_is_estimate) AS impr_share_is_estimate,
         AVG(outranking_share::numeric)::text AS outranking_share,
         AVG(overlap_rate::numeric)::text AS overlap_rate,
         mode() WITHIN GROUP (ORDER BY competitor_quadrant) AS competitor_quadrant
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

    let competitors: CompetitorDetail[] = []

    if (result.rows.length > 0) {
      competitors = result.rows.map(row => {
        const quadrant = row.competitor_quadrant && row.competitor_quadrant in AUCTION_QUADRANT_LABELS
          ? row.competitor_quadrant as keyof typeof AUCTION_QUADRANT_LABELS
          : classifyAuctionCompetitorQuadrant(
              row.overlap_rate != null ? parseFloat(row.overlap_rate) : null,
              row.impr_share != null ? parseFloat(row.impr_share) : null,
              row.is_self,
            )

        return {
          quadrant,
          quadrant_label: AUCTION_QUADRANT_LABELS[quadrant],
          name: row.shop_display_name,
          is_shareight: row.is_self,
          days_seen: fallbackDaysInMonth,
          avg_overlap_rate: toPercent(row.overlap_rate) ?? 0,
          avg_you_outranking: toPercent(row.outranking_share) ?? 0,
          avg_them_outranking: 0,
          avg_their_impression_share: toPercent(row.impr_share),
          impression_share_is_estimate: row.impr_share_is_estimate,
          max_overlap_rate: toPercent(row.overlap_rate) ?? 0,
          max_them_outranking: 0,
        }
      })
    } else {
      const globalThresholds = await fetchAuctionClassificationSettings()
      const retailerOverrides = await fetchAuctionClassificationOverrideMap([retailerId])
      const thresholds = {
        overlapHigh: retailerOverrides.get(retailerId)?.overlapHigh ?? globalThresholds.overlapHigh,
        impressionShareHigh: retailerOverrides.get(retailerId)?.impressionShareHigh ?? globalThresholds.impressionShareHigh,
      }

      const snapshotResult = await query<{
        range_start: string
        range_end: string
        competitors: SnapshotCompetitor[] | null
      }>(
        `SELECT range_start::text, range_end::text, competitors
         FROM auction_insights_snapshots
         WHERE retailer_id = $1
           AND range_type = 'month'
           AND range_start = $2::date
         ORDER BY snapshot_date DESC, last_updated DESC
         LIMIT 1`,
        [retailerId, monthDate],
      )

      const snapshot = snapshotResult.rows[0]
      if (!snapshot || !Array.isArray(snapshot.competitors) || snapshot.competitors.length === 0) {
        return NextResponse.json(
          { error: `No auction data for period ${period}` },
          { status: 404 },
        )
      }

      const start = new Date(snapshot.range_start)
      const end = new Date(snapshot.range_end)
      const daysSeen = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
        ? fallbackDaysInMonth
        : Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)

      competitors = snapshot.competitors.map(comp => {
        const overlap = typeof comp.overlap_rate === 'number' ? comp.overlap_rate * 100 : 0
        const outranking = typeof comp.outranking_share === 'number' ? comp.outranking_share * 100 : 0
        const impressionShare = typeof comp.impression_share === 'number' ? comp.impression_share * 100 : null
        const quadrant = classifyAuctionCompetitorQuadrant(comp.overlap_rate, comp.impression_share, false, thresholds)
        return {
          quadrant,
          quadrant_label: AUCTION_QUADRANT_LABELS[quadrant],
          name: comp.id ?? comp.name ?? comp.competitor_name ?? 'Unknown Competitor',
          is_shareight: false,
          days_seen: daysSeen,
          avg_overlap_rate: overlap,
          avg_you_outranking: outranking,
          avg_them_outranking: 0,
          avg_their_impression_share: impressionShare,
          impression_share_is_estimate: false,
          max_overlap_rate: overlap,
          max_them_outranking: 0,
        }
      })
    }

    const demoRetailer = await isDemoRetailer(retailerId)

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'auctions-competitors', period },
    })

    return NextResponse.json(
      demoRetailer
        ? sanitiseAuctionCompetitorRows(competitors as unknown as Array<Record<string, unknown>>)
        : competitors
    )
  } catch (error) {
    console.error('Auction competitors error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
