import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { serializeAnalyticsData, validateTier } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

const buildOrderBy = (sortBy: string) => {
  switch (sortBy) {
    case 'clicks':
      return 'total_clicks'
    case 'efficiency':
      return 'click_to_conversion_pct'
    case 'impressions':
      return 'total_impressions'
    case 'conversions':
    default:
      return 'total_conversions'
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
    const sortBy = searchParams.get('sort_by') || 'conversions'
    const tierParam = searchParams.get('tier') || 'all'
    const tier = validateTier(tierParam)
    const minFrequency = Number(searchParams.get('min_frequency') || '3')
    const limit = Number(searchParams.get('limit') || '50')

    if (!tier) {
      return NextResponse.json({ error: 'Invalid tier parameter' }, { status: 400 })
    }

    const dateStart = Date.now()
    const latestDateResult = await query(
      `SELECT MAX(analysis_date) AS analysis_date
       FROM keyword_word_analysis
       WHERE retailer_id = $1`,
      [retailerId]
    )
    logSlowQuery('keyword_word_analysis_latest', Date.now() - dateStart)

    const latestDate = latestDateResult.rows[0]?.analysis_date as Date | null

    if (!latestDate) {
      return NextResponse.json(
        serializeAnalyticsData({
          words: [],
          summary: {
            total_words: 0,
            star_words: 0,
            good_words: 0,
            dead_words: 0,
            poor_words: 0,
            average_words: 0,
            total_conversions: 0,
            total_clicks: 0,
            wasted_clicks: 0,
            analysis_date: null,
          },
          message: 'No word analysis data available',
        })
      )
    }

    const orderBy = buildOrderBy(sortBy)
    const paramsList: Array<string | Date | number> = [retailerId, latestDate, minFrequency, limit]
    let tierClause = ''

    if (tier !== 'all') {
      paramsList.splice(3, 0, tier)
      tierClause = 'AND performance_tier = $4'
    }

    const limitParamIndex = tier !== 'all' ? 5 : 4

    const wordsStart = Date.now()
    const wordsResult = await query(
      `SELECT word,
              keyword_count,
              keywords_with_clicks,
              keywords_with_conversions,
              total_impressions,
              total_clicks,
              total_conversions,
              avg_ctr,
              avg_cvr,
              click_to_conversion_pct,
              word_category,
              performance_tier
       FROM keyword_word_analysis
       WHERE retailer_id = $1
         AND analysis_date = $2
         AND keyword_count >= $3
         ${tierClause}
       ORDER BY ${orderBy} DESC
       LIMIT $${limitParamIndex}`,
      paramsList
    )
    logSlowQuery('keyword_word_analysis', Date.now() - wordsStart)

    const summaryStart = Date.now()
    const summaryResult = await query(
      `SELECT
          COUNT(*) AS total_words,
          SUM(CASE WHEN performance_tier = 'star' THEN 1 ELSE 0 END) AS star_words,
          SUM(CASE WHEN performance_tier = 'good' THEN 1 ELSE 0 END) AS good_words,
          SUM(CASE WHEN performance_tier = 'dead' THEN 1 ELSE 0 END) AS dead_words,
          SUM(CASE WHEN performance_tier = 'poor' THEN 1 ELSE 0 END) AS poor_words,
          SUM(CASE WHEN performance_tier = 'average' THEN 1 ELSE 0 END) AS average_words,
          COALESCE(SUM(total_conversions), 0) AS total_conversions,
          COALESCE(SUM(total_clicks), 0) AS total_clicks,
          COALESCE(SUM(CASE WHEN total_conversions = 0 THEN total_clicks ELSE 0 END), 0) AS wasted_clicks
       FROM keyword_word_analysis
       WHERE retailer_id = $1
         AND analysis_date = $2
         AND keyword_count >= $3`,
      [retailerId, latestDate, minFrequency]
    )
    logSlowQuery('keyword_word_analysis_summary', Date.now() - summaryStart)

    const response = {
      words: wordsResult.rows,
      summary: {
        ...summaryResult.rows[0],
        analysis_date: latestDate,
      },
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'word-analysis', sort_by: sortBy },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching word analysis:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch word analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
