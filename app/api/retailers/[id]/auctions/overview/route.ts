import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import type { AuctionInsightsResponse } from '@/types'

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
    let period = searchParams.get('period') // expected: YYYY-MM

    // Fall back to the most recent month with data for this retailer
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

    if (result.rows.length === 0) {
      const [beforeResult, afterResult] = await Promise.all([
        query<{ month: string }>(
          `SELECT to_char(MAX(month), 'YYYY-MM') AS month
           FROM auction_insights
           WHERE retailer_id = $1 AND month < $2::date AND preferred_for_display = true`,
          [retailerId, monthDate],
        ),
        query<{ month: string }>(
          `SELECT to_char(MIN(month), 'YYYY-MM') AS month
           FROM auction_insights
           WHERE retailer_id = $1 AND month > $2::date AND preferred_for_display = true`,
          [retailerId, monthDate],
        ),
      ])
      return NextResponse.json(
        {
          error: `No auction data for period ${period}`,
          nearest_before: beforeResult.rows[0]?.month ?? null,
          nearest_after: afterResult.rows[0]?.month ?? null,
        },
        { status: 404 },
      )
    }

    const selfRow = result.rows.find(r => r.is_self)
    const competitors = result.rows.filter(r => !r.is_self)

    // Detect multi-account: check if multiple (provider, slug) pairs have preferred data for this month
    const multiAccountResult = await query<{
      account_name: string | null
      provider: string | null
      slug: string | null
      is_preferred: boolean
    }>(
      `SELECT
         MAX(account_name) AS account_name,
         provider,
         slug,
         bool_or(preferred_for_display) AS is_preferred
       FROM auction_insights
       WHERE retailer_id = $1 AND month = $2::date
       GROUP BY provider, slug
       ORDER BY bool_or(preferred_for_display) DESC, provider, slug`,
      [retailerId, monthDate],
    )
    const distinctAccounts = multiAccountResult.rows.filter(r => r.provider && r.slug)
    const multiAccount = distinctAccounts.length > 1
      ? (() => {
          const preferred = distinctAccounts.find(r => r.is_preferred) ?? distinctAccounts[0]
          return {
            active_account_name: preferred.account_name ?? `${preferred.provider}-${preferred.slug}`,
            provider: preferred.provider!,
            slug: preferred.slug!,
            all_accounts: distinctAccounts.map(r => ({
              account_name: r.account_name ?? `${r.provider}-${r.slug}`,
              provider: r.provider!,
              slug: r.slug!,
            })),
          }
        })()
      : null

    const toPercent = (v: string | null): number | null =>
      v != null ? parseFloat(v) * 100 : null

    const avgOf = (vals: Array<number | null>): number => {
      const valid = vals.filter(v => v != null) as number[]
      return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
    }

    const compData = competitors.map(c => ({
      name: c.shop_display_name,
      overlap: toPercent(c.overlap_rate),
      outranking: toPercent(c.outranking_share),
    }))

    const avgOverlap = avgOf(compData.map(c => c.overlap))
    const avgOutranking = avgOf(compData.map(c => c.outranking))

    const byOverlap = compData
      .filter(c => c.overlap != null)
      .sort((a, b) => (b.overlap ?? 0) - (a.overlap ?? 0))
    const byOutrankingAsc = compData
      .filter(c => c.outranking != null)
      .sort((a, b) => (a.outranking ?? 0) - (b.outranking ?? 0))
    const byOutrankingDesc = [...byOutrankingAsc].reverse()

    const [y, m] = period.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()

    const response: AuctionInsightsResponse = {
      overview: {
        avg_impression_share: selfRow ? (toPercent(selfRow.impr_share) ?? 0) : 0,
        total_competitors: competitors.length,
        avg_overlap_rate: avgOverlap,
        avg_outranking_share: avgOutranking,
        avg_being_outranked: 0,
      },
      multi_account: multiAccount,
      top_competitor: byOverlap[0]
        ? { name: byOverlap[0].name, overlap_rate: byOverlap[0].overlap ?? 0, you_outranking: byOverlap[0].outranking ?? 0 }
        : null,
      biggest_threat: byOutrankingAsc[0]
        ? { name: byOutrankingAsc[0].name, overlap_rate: byOutrankingAsc[0].overlap ?? 0, you_outranking: byOutrankingAsc[0].outranking ?? 0 }
        : null,
      best_opportunity: byOutrankingDesc[0]
        ? { name: byOutrankingDesc[0].name, overlap_rate: byOutrankingDesc[0].overlap ?? 0, you_outranking: byOutrankingDesc[0].outranking ?? 0 }
        : null,
      date_range: {
        start: monthDate,
        end: new Date(y, m - 1, daysInMonth).toISOString().slice(0, 10),
        days: daysInMonth,
      },
      source: 'db',
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'auction-overview', period },
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('Auction overview error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
