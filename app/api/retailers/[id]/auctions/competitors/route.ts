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

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id: retailerId } = params
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
          competitors: [],
          message: 'No auction competitor data available',
        })
      )
    }

    const { start, end } = parsePeriod(period)
    const orderBy = buildOrderBy(sortBy)

    const dataStart = Date.now()
    const dataResult = await query(
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
         AND insight_date < $3
       ORDER BY ${orderBy} DESC`,
      [retailerId, start, end]
    )
    logSlowQuery('auction_insights_competitors', Date.now() - dataStart)

    const competitors = dataResult.rows.map((row, index) => ({
      rank: index + 1,
      domain: row.competitor_domain,
      overlap_rate: row.overlap_rate,
      position_above_rate: row.position_above_rate,
      top_of_page_rate: row.top_of_page_rate,
      absolute_top_rate: row.absolute_top_rate,
      outranking_share: row.outranking_share,
      impression_share: row.impression_share,
    }))

    const response = {
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
      details: { endpoint: 'auction-competitors', period, sort_by: sortBy },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching auction competitors:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch auction competitors',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
