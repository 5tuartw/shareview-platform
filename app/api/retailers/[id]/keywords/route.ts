import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { parsePeriod, serializeAnalyticsData, validateMetric, validateTier } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

const buildOrderBy = (metric: string) => {
  switch (metric) {
    case 'clicks':
      return 'total_clicks'
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
    const metricParam = searchParams.get('metric') || 'conversions'
    const metric = validateMetric(metricParam)
    const tierParam = searchParams.get('tier') || 'all'
    const tier = validateTier(tierParam)
    const limit = Number(searchParams.get('limit') || '20')
    const periodParam = searchParams.get('period') || new Date().toISOString().slice(0, 7)

    if (!metric) {
      return NextResponse.json({ error: 'Invalid metric parameter' }, { status: 400 })
    }

    if (!tier) {
      return NextResponse.json({ error: 'Invalid tier parameter' }, { status: 400 })
    }

    await query("SET work_mem = '256MB'")

    const { start, end } = parsePeriod(periodParam)
    const orderBy = buildOrderBy(metric)

    const paramsList: Array<string | Date | number> = [retailerId, start, end, limit]
    let tierClause = ''

    if (tier !== 'all') {
      paramsList.splice(3, 0, tier)
      tierClause = 'AND performance_tier = $4'
    }

    const limitParamIndex = tier !== 'all' ? 5 : 4

    const keywordsStart = Date.now()
    const keywordsResult = await query(
      `SELECT search_term,
              total_impressions,
              total_clicks,
              total_conversions,
              ctr,
              conversion_rate,
              performance_tier,
              first_seen,
              last_seen
       FROM mv_keywords_actionable
       WHERE retailer_id = $1
         AND last_seen >= $2
         AND first_seen < $3
         ${tierClause}
       ORDER BY ${orderBy} DESC
       LIMIT $${limitParamIndex}`,
      paramsList
    )
    logSlowQuery('mv_keywords_actionable', Date.now() - keywordsStart)

    const summaryStart = Date.now()
    const summaryResult = await query(
      `SELECT
          COUNT(DISTINCT search_term) AS unique_search_terms,
          COALESCE(SUM(total_impressions), 0) AS total_impressions,
          COALESCE(SUM(total_clicks), 0) AS total_clicks,
          COALESCE(SUM(total_conversions), 0) AS total_conversions,
          SUM(CASE WHEN total_conversions > 0 THEN 1 ELSE 0 END) AS terms_with_conversions,
          SUM(CASE WHEN total_clicks > 0 THEN 1 ELSE 0 END) AS terms_with_clicks,
          CASE WHEN SUM(total_impressions) > 0
            THEN (SUM(total_clicks)::numeric / SUM(total_impressions)::numeric) * 100
            ELSE 0 END AS overall_ctr,
          CASE WHEN SUM(total_clicks) > 0
            THEN (SUM(total_conversions)::numeric / SUM(total_clicks)::numeric) * 100
            ELSE 0 END AS overall_cvr,
          CASE WHEN SUM(total_clicks) > 0
            THEN (SUM(total_conversions)::numeric / SUM(total_clicks)::numeric) * 100
            ELSE 0 END AS overall_conversion_rate,
          SUM(CASE WHEN performance_tier = 'star' THEN 1 ELSE 0 END) AS tier_star,
          SUM(CASE WHEN performance_tier = 'strong' THEN 1 ELSE 0 END) AS tier_strong,
          SUM(CASE WHEN performance_tier = 'underperforming' THEN 1 ELSE 0 END) AS tier_underperforming,
          SUM(CASE WHEN performance_tier = 'poor' THEN 1 ELSE 0 END) AS tier_poor
       FROM mv_keywords_actionable
       WHERE retailer_id = $1
         AND last_seen >= $2
         AND first_seen < $3`,
      [retailerId, start, end]
    )
    logSlowQuery('mv_keywords_actionable_summary', Date.now() - summaryStart)

    const response = {
      keywords: keywordsResult.rows,
      summary: summaryResult.rows[0],
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'keywords', period: periodParam, tier },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching keyword performance:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch keyword performance',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
