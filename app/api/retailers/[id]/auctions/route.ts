import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryAnalytics, getAnalyticsNetworkId } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { parsePeriod, serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

const buildOrderBy = (sortBy: string) => {
  switch (sortBy) {
    case 'outranking_share':
      return 'outranking_share'
    case 'impression_share':
      return 'impression_share'
    case 'overlap_rate':
    default:
      return 'overlap_rate'
  }
}

const calculateScores = (overlapRate: number, outrankingShare: number) => {
  const threatScore = overlapRate * outrankingShare
  const opportunityScore = overlapRate * (1 - outrankingShare)
  return { threatScore, opportunityScore }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const sortBy = searchParams.get('sort_by') || 'overlap_rate'
    let period = searchParams.get('period')

    const networkId = await getAnalyticsNetworkId(retailerId)
    if (!networkId) {
      return NextResponse.json({ error: 'Retailer mapping not found' }, { status: 404 })
    }

    if (!period) {
      const latestStart = Date.now()
      const latestResult = await queryAnalytics(
        `SELECT MAX(insight_date) AS latest_date
         FROM auction_insights
         WHERE retailer_id = $1`,
        [networkId]
      )
      logSlowQuery('auction_insights_latest', Date.now() - latestStart)

      const latestDate = latestResult.rows[0]?.latest_date as Date | null
      if (latestDate) {
        period = latestDate.toISOString().slice(0, 7)
      }
    }

    if (!period) {
      return NextResponse.json(
        serializeAnalyticsData({
          overview: null,
          competitors: [],
          message: 'No auction insights data available',
        })
      )
    }

    const { start, end } = parsePeriod(period)
    const orderBy = buildOrderBy(sortBy)

    const dataStart = Date.now()
    const dataResult = await queryAnalytics(
      `SELECT competitor_domain,
              overlap_rate,
              position_above_rate,
              top_of_page_rate,
              absolute_top_rate,
              outranking_share,
              impression_share
       FROM auction_insights
       WHERE retailer_id = $1
         AND insight_date >= $2
         AND insight_date < $3`,
      [networkId, start, end]
    )
    logSlowQuery('auction_insights_combined', Date.now() - dataStart)

    const rows = dataResult.rows
    const totalCompetitors = rows.length
    const avgOverlapRate = totalCompetitors
      ? rows.reduce((sum, row) => sum + Number(row.overlap_rate || 0), 0) / totalCompetitors
      : 0
    const avgOutrankingShare = totalCompetitors
      ? rows.reduce((sum, row) => sum + Number(row.outranking_share || 0), 0) / totalCompetitors
      : 0
    const avgImpressionShare = totalCompetitors
      ? rows.reduce((sum, row) => sum + Number(row.impression_share || 0), 0) / totalCompetitors
      : 0

    const competitors = [...rows]
      .sort((a, b) => Number(b[orderBy] || 0) - Number(a[orderBy] || 0))
      .map((row, index) => ({
        rank: index + 1,
        domain: row.competitor_domain,
        overlap_rate: row.overlap_rate,
        position_above_rate: row.position_above_rate,
        top_of_page_rate: row.top_of_page_rate,
        absolute_top_rate: row.absolute_top_rate,
        outranking_share: row.outranking_share,
        impression_share: row.impression_share,
        ...calculateScores(Number(row.overlap_rate || 0), Number(row.outranking_share || 0)),
      }))

    const response = {
      overview: {
        total_competitors: totalCompetitors,
        avg_overlap_rate: avgOverlapRate,
        avg_outranking_share: avgOutrankingShare,
        avg_impression_share: avgImpressionShare,
      },
      competitors,
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      sort_by: sortBy,
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'auctions', period, sort_by: sortBy },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching auctions:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch auctions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
