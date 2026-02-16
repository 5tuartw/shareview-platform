import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { calculatePercentageChange, serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
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

    const latestStart = Date.now()
    const latestResult = await query(
      `SELECT MAX(insight_date) AS latest_date
       FROM category_performance
       WHERE retailer_id = $1`,
      [retailerId]
    )
    logSlowQuery('category_performance_latest', Date.now() - latestStart)

    const latestDate = latestResult.rows[0]?.latest_date as Date | null

    if (!latestDate) {
      return NextResponse.json(
        serializeAnalyticsData({
          trends: [],
          date_ranges: {
            recent: null,
            previous: null,
          },
        })
      )
    }

    const recentEnd = new Date(latestDate)
    const recentStart = new Date(recentEnd)
    recentStart.setUTCDate(recentStart.getUTCDate() - 6)

    const previousEnd = new Date(recentStart)
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
    const previousStart = new Date(previousEnd)
    previousStart.setUTCDate(previousStart.getUTCDate() - 6)

    const trendsStart = Date.now()
    const trendsResult = await query(
      `WITH recent_period AS (
          SELECT category_level1,
                 category_level2,
                 category_level3,
                 COALESCE(SUM(impressions), 0) AS impressions,
                 COALESCE(SUM(clicks), 0) AS clicks,
                 COALESCE(SUM(conversions), 0) AS conversions
          FROM category_performance
          WHERE retailer_id = $1
            AND insight_date >= $2
            AND insight_date <= $3
          GROUP BY category_level1, category_level2, category_level3
        ),
        previous_period AS (
          SELECT category_level1,
                 category_level2,
                 category_level3,
                 COALESCE(SUM(impressions), 0) AS impressions,
                 COALESCE(SUM(clicks), 0) AS clicks,
                 COALESCE(SUM(conversions), 0) AS conversions
          FROM category_performance
          WHERE retailer_id = $1
            AND insight_date >= $4
            AND insight_date <= $5
          GROUP BY category_level1, category_level2, category_level3
        )
        SELECT
          COALESCE(r.category_level1, p.category_level1) AS category_level1,
          COALESCE(r.category_level2, p.category_level2) AS category_level2,
          COALESCE(r.category_level3, p.category_level3) AS category_level3,
          COALESCE(r.impressions, 0) AS recent_impressions,
          COALESCE(p.impressions, 0) AS previous_impressions,
          COALESCE(r.clicks, 0) AS recent_clicks,
          COALESCE(p.clicks, 0) AS previous_clicks,
          COALESCE(r.conversions, 0) AS recent_conversions,
          COALESCE(p.conversions, 0) AS previous_conversions
        FROM recent_period r
        FULL OUTER JOIN previous_period p
          ON r.category_level1 = p.category_level1
         AND r.category_level2 = p.category_level2
         AND r.category_level3 = p.category_level3`,
      [retailerId, recentStart, recentEnd, previousStart, previousEnd]
    )
    logSlowQuery('category_performance_trends', Date.now() - trendsStart)

    const trends = trendsResult.rows
      .filter((row) => row.category_level3)
      .map((row) => ({
        ...row,
        impressions_change_pct: calculatePercentageChange(
          Number(row.recent_impressions),
          Number(row.previous_impressions)
        ),
        clicks_change_pct: calculatePercentageChange(
          Number(row.recent_clicks),
          Number(row.previous_clicks)
        ),
        conversions_change_pct: calculatePercentageChange(
          Number(row.recent_conversions),
          Number(row.previous_conversions)
        ),
        recent_ctr:
          Number(row.recent_impressions) > 0
            ? (Number(row.recent_clicks) / Number(row.recent_impressions)) * 100
            : 0,
        previous_ctr:
          Number(row.previous_impressions) > 0
            ? (Number(row.previous_clicks) / Number(row.previous_impressions)) * 100
            : 0,
        recent_cvr:
          Number(row.recent_clicks) > 0
            ? (Number(row.recent_conversions) / Number(row.recent_clicks)) * 100
            : 0,
        previous_cvr:
          Number(row.previous_clicks) > 0
            ? (Number(row.previous_conversions) / Number(row.previous_clicks)) * 100
            : 0,
      }))

    const response = {
      trends,
      date_ranges: {
        recent: {
          start: recentStart.toISOString().split('T')[0],
          end: recentEnd.toISOString().split('T')[0],
        },
        previous: {
          start: previousStart.toISOString().split('T')[0],
          end: previousEnd.toISOString().split('T')[0],
        },
      },
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'category-trends' },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching category trends:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch category trends',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
