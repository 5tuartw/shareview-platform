import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { parsePeriod, serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
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
    let period = searchParams.get('period')

    if (!period) {
      const latestStart = Date.now()
      const latestResult = await query(
        `SELECT MAX(insight_date) AS latest_date
         FROM auction_insights
         WHERE retailer_id = $1`,
        [retailerId]
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
          top_competitors: [],
          message: 'No auction insights data available',
        })
      )
    }

    const { start, end } = parsePeriod(period)

    const dataStart = Date.now()
    const dataResult = await query(
      `SELECT competitor_domain,
              overlap_rate,
              outranking_share,
              impression_share
       FROM auction_insights
       WHERE retailer_id = $1
         AND insight_date >= $2
         AND insight_date < $3`,
      [retailerId, start, end]
    )
    logSlowQuery('auction_insights', Date.now() - dataStart)

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

    const topCompetitors = rows
      .map((row) => {
        const scores = calculateScores(Number(row.overlap_rate || 0), Number(row.outranking_share || 0))
        return {
          domain: row.competitor_domain,
          overlap_rate: row.overlap_rate,
          outranking_share: row.outranking_share,
          impression_share: row.impression_share,
          threat_score: scores.threatScore,
          opportunity_score: scores.opportunityScore,
        }
      })
      .sort((a, b) => Number(b.overlap_rate || 0) - Number(a.overlap_rate || 0))
      .slice(0, 5)

    const response = {
      overview: {
        total_competitors: totalCompetitors,
        avg_overlap_rate: avgOverlapRate,
        avg_outranking_share: avgOutrankingShare,
        avg_impression_share: avgImpressionShare,
      },
      top_competitors: topCompetitors,
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'auction-overview', period },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching auction overview:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch auction overview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
