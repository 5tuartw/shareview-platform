import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import type { AuctionInsightsResponse } from '@/types'
import { isDemoRetailer, sanitiseAuctionEntity } from '@/lib/demo-jargon-sanitizer'

type SnapshotCompetitor = {
  id?: string
  name?: string
  competitor_name?: string
  overlap_rate?: number
  outranking_share?: number
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

    const avgOf = (vals: Array<number | null>): number => {
      const valid = vals.filter(v => v != null) as number[]
      return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
    }

    const buildNotFoundResponse = async () => {
      const [beforeResult, afterResult] = await Promise.all([
        query<{ month: string }>(
          `SELECT to_char(MAX(month_start), 'YYYY-MM') AS month
           FROM (
             SELECT month AS month_start
             FROM auction_insights
             WHERE retailer_id = $1 AND preferred_for_display = true
             UNION ALL
             SELECT range_start AS month_start
             FROM auction_insights_snapshots
             WHERE retailer_id = $1 AND range_type = 'month'
           ) all_months
           WHERE month_start < $2::date`,
          [retailerId, monthDate],
        ),
        query<{ month: string }>(
          `SELECT to_char(MIN(month_start), 'YYYY-MM') AS month
           FROM (
             SELECT month AS month_start
             FROM auction_insights
             WHERE retailer_id = $1 AND preferred_for_display = true
             UNION ALL
             SELECT range_start AS month_start
             FROM auction_insights_snapshots
             WHERE retailer_id = $1 AND range_type = 'month'
           ) all_months
           WHERE month_start > $2::date`,
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

    if (result.rows.length === 0) {
      const snapshotResult = await query<{
        range_start: string
        range_end: string
        avg_impression_share: number | null
        total_competitors: number | null
        avg_overlap_rate: number | null
        avg_outranking_share: number | null
        avg_being_outranked: number | null
        top_competitor_id: string | null
        top_competitor_overlap_rate: number | null
        top_competitor_outranking_you: number | null
        biggest_threat_id: string | null
        biggest_threat_overlap_rate: number | null
        biggest_threat_outranking_you: number | null
        best_opportunity_id: string | null
        best_opportunity_overlap_rate: number | null
        best_opportunity_you_outranking: number | null
        competitors: SnapshotCompetitor[] | null
      }>(
        `SELECT
           range_start::text,
           range_end::text,
           avg_impression_share,
           total_competitors,
           avg_overlap_rate,
           avg_outranking_share,
           avg_being_outranked,
           top_competitor_id,
           top_competitor_overlap_rate,
           top_competitor_outranking_you,
           biggest_threat_id,
           biggest_threat_overlap_rate,
           biggest_threat_outranking_you,
           best_opportunity_id,
           best_opportunity_overlap_rate,
           best_opportunity_you_outranking,
           competitors
         FROM auction_insights_snapshots
         WHERE retailer_id = $1
           AND range_type = 'month'
           AND range_start = $2::date
         ORDER BY snapshot_date DESC, last_updated DESC
         LIMIT 1`,
        [retailerId, monthDate],
      )

      const snapshot = snapshotResult.rows[0]
      if (!snapshot) {
        return buildNotFoundResponse()
      }

      const start = new Date(snapshot.range_start)
      const end = new Date(snapshot.range_end)
      const daysInPeriod = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
        ? fallbackDaysInMonth
        : Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)

      const competitors = Array.isArray(snapshot.competitors)
        ? snapshot.competitors.map(comp => ({
            name: comp.id ?? comp.name ?? comp.competitor_name ?? 'Unknown Competitor',
            overlap: typeof comp.overlap_rate === 'number' ? comp.overlap_rate * 100 : null,
            outranking: typeof comp.outranking_share === 'number' ? comp.outranking_share * 100 : null,
          }))
        : []

      const byOverlap = competitors
        .filter(c => c.overlap != null)
        .sort((a, b) => (b.overlap ?? 0) - (a.overlap ?? 0))
      const byOutrankingAsc = competitors
        .filter(c => c.outranking != null)
        .sort((a, b) => (a.outranking ?? 0) - (b.outranking ?? 0))
      const byOutrankingDesc = [...byOutrankingAsc].reverse()

      const response: AuctionInsightsResponse = {
        overview: {
          avg_impression_share: (snapshot.avg_impression_share ?? 0) * 100,
          total_competitors: snapshot.total_competitors ?? competitors.length,
          avg_overlap_rate: (snapshot.avg_overlap_rate ?? avgOf(competitors.map(c => c.overlap))) * 100,
          avg_outranking_share: (snapshot.avg_outranking_share ?? avgOf(competitors.map(c => c.outranking))) * 100,
          avg_being_outranked: (snapshot.avg_being_outranked ?? 0) * 100,
        },
        multi_account: null,
        top_competitor: snapshot.top_competitor_id
          ? {
              name: snapshot.top_competitor_id,
              overlap_rate: (snapshot.top_competitor_overlap_rate ?? 0) * 100,
              you_outranking: (snapshot.top_competitor_outranking_you ?? 0) * 100,
            }
          : (byOverlap[0]
              ? {
                  name: byOverlap[0].name,
                  overlap_rate: byOverlap[0].overlap ?? 0,
                  you_outranking: byOverlap[0].outranking ?? 0,
                }
              : null),
        biggest_threat: snapshot.biggest_threat_id
          ? {
              name: snapshot.biggest_threat_id,
              overlap_rate: (snapshot.biggest_threat_overlap_rate ?? 0) * 100,
              you_outranking: (snapshot.biggest_threat_outranking_you ?? 0) * 100,
            }
          : (byOutrankingAsc[0]
              ? {
                  name: byOutrankingAsc[0].name,
                  overlap_rate: byOutrankingAsc[0].overlap ?? 0,
                  you_outranking: byOutrankingAsc[0].outranking ?? 0,
                }
              : null),
        best_opportunity: snapshot.best_opportunity_id
          ? {
              name: snapshot.best_opportunity_id,
              overlap_rate: (snapshot.best_opportunity_overlap_rate ?? 0) * 100,
              you_outranking: (snapshot.best_opportunity_you_outranking ?? 0) * 100,
            }
          : (byOutrankingDesc[0]
              ? {
                  name: byOutrankingDesc[0].name,
                  overlap_rate: byOutrankingDesc[0].overlap ?? 0,
                  you_outranking: byOutrankingDesc[0].outranking ?? 0,
                }
              : null),
        date_range: {
          start: snapshot.range_start,
          end: snapshot.range_end,
          days: daysInPeriod,
        },
        source: 'snapshot',
      }

      const demoRetailer = await isDemoRetailer(retailerId)

      await logActivity({
        userId: Number(session.user.id),
        action: 'retailer_viewed',
        retailerId,
        entityType: 'retailer',
        entityId: retailerId,
        details: { endpoint: 'auction-overview', period, source: 'snapshot' },
      })

      return NextResponse.json(
        demoRetailer
          ? {
              ...response,
              top_competitor: sanitiseAuctionEntity(response.top_competitor),
              biggest_threat: sanitiseAuctionEntity(response.biggest_threat),
              best_opportunity: sanitiseAuctionEntity(response.best_opportunity),
            }
          : response
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

    const demoRetailer = await isDemoRetailer(retailerId)

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'auction-overview', period },
    })

    return NextResponse.json(
      demoRetailer
        ? {
            ...response,
            top_competitor: sanitiseAuctionEntity(response.top_competitor),
            biggest_threat: sanitiseAuctionEntity(response.biggest_threat),
            best_opportunity: sanitiseAuctionEntity(response.best_opportunity),
          }
        : response
    )
  } catch (error) {
    console.error('Auction overview error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
