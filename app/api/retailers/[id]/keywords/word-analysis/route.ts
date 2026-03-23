import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { getAvailableMonthsWithBounds, parsePeriod, serializeAnalyticsData, validateTier } from '@/lib/analytics-utils'

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
    const sortBy = searchParams.get('sort_by') || 'conversions'
    const tierParam = searchParams.get('tier') || 'all'
    const tier = validateTier(tierParam)
    const minFrequency = Number(searchParams.get('min_frequency') || '3')
    const limit = Number(searchParams.get('limit') || '50')
    const requestedPeriod = searchParams.get('period')
    const requestedStart = searchParams.get('start')
    const requestedEnd = searchParams.get('end')

    if (!tier) {
      return NextResponse.json({ error: 'Invalid tier parameter' }, { status: 400 })
    }

    let rangeStart: string | null = null
    let rangeEnd: string | null = null

    if (requestedStart && requestedEnd) {
      rangeStart = requestedStart.slice(0, 10)
      rangeEnd = requestedEnd.slice(0, 10)
    } else {
      let periodParam = requestedPeriod
      if (!periodParam) {
        const latestPeriodResult = await query(
          `SELECT to_char(MAX(range_start), 'YYYY-MM') AS latest_period
           FROM keyword_word_analysis_snapshots
           WHERE retailer_id = $1
             AND range_type = 'month'`,
          [retailerId]
        )
        periodParam = latestPeriodResult.rows[0]?.latest_period || null
      }

      if (!periodParam) {
        return NextResponse.json({ error: 'No word analysis snapshot data available for this retailer' }, { status: 404 })
      }

      const parsed = parsePeriod(periodParam)
      rangeStart = parsed.start.toISOString().slice(0, 10)
      rangeEnd = parsed.end.toISOString().slice(0, 10)
    }

    const availableMonths = await getAvailableMonthsWithBounds(retailerId, 'keywords')

    const snapshotCheckStart = Date.now()
    const snapshotCheck = await query(
      `SELECT source_analysis_date
       FROM keyword_word_analysis_snapshots
       WHERE retailer_id = $1
         AND range_start = $2::date
         AND range_end = $3::date
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [retailerId, rangeStart, rangeEnd]
    )
    logSlowQuery('keyword_word_analysis_snapshot_check', Date.now() - snapshotCheckStart)

    const sourceAnalysisDate = snapshotCheck.rows[0]?.source_analysis_date as Date | null

    if (!sourceAnalysisDate) {
      const requestedMonth = requestedPeriod ?? rangeStart?.slice(0, 7)
      const periods = availableMonths.map((month) => month.period)
      const nearest_before = requestedMonth ? periods.filter((p) => p < requestedMonth).slice(-1)[0] ?? null : null
      const nearest_after = requestedMonth ? periods.find((p) => p > requestedMonth) ?? null : null
      return NextResponse.json(
        { error: 'No word analysis snapshot data available for this period', nearest_before, nearest_after },
        { status: 404 }
      )
    }

    const orderBy = buildOrderBy(sortBy)
    const paramsList: Array<string | number> = [retailerId, rangeStart, rangeEnd, minFrequency, limit]
    let tierClause = ''

    if (tier !== 'all') {
      paramsList.splice(4, 0, tier)
      tierClause = 'AND performance_tier = $5'
    }

    const limitParamIndex = tier !== 'all' ? 6 : 5

    const wordsStart = Date.now()
    const wordsResult = await query(
      `SELECT word,
              total_occurrences,
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
       FROM keyword_word_analysis_snapshots
       WHERE retailer_id = $1
         AND range_start = $2::date
         AND range_end = $3::date
         AND keyword_count >= $4
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
          COALESCE(SUM(total_impressions), 0) AS total_impressions,
          COALESCE(SUM(total_conversions), 0) AS total_conversions,
          COALESCE(SUM(total_clicks), 0) AS total_clicks,
           COALESCE(SUM(CASE WHEN performance_tier = 'dead' THEN total_clicks ELSE 0 END), 0) AS wasted_clicks
         FROM keyword_word_analysis_snapshots
       WHERE retailer_id = $1
          AND range_start = $2::date
          AND range_end = $3::date
          AND keyword_count >= $4`,
        [retailerId, rangeStart, rangeEnd, minFrequency]
    )
    logSlowQuery('keyword_word_analysis_summary', Date.now() - summaryStart)

    const response = {
      words: wordsResult.rows,
      summary: {
        ...summaryResult.rows[0],
        analysis_date: sourceAnalysisDate,
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
