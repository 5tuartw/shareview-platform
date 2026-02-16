import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryAnalytics } from '@/lib/db'
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

    const { searchParams } = new URL(request.url)
    const viewType = searchParams.get('view_type') === 'monthly' ? 'monthly' : 'weekly'
    const fetchDatetime = searchParams.get('fetch_datetime')

    const cacheStart = Date.now()
    const cacheResult = await queryAnalytics(
      `SELECT data, fetch_datetime
       FROM retailer_dashboard_cache
       WHERE retailer_id = $1
         AND view_type = $2
         AND ($3::timestamptz IS NULL OR fetch_datetime = $3::timestamptz)
       ORDER BY fetch_datetime DESC
       LIMIT 1`,
      [retailerId, viewType, fetchDatetime]
    )
    logSlowQuery('retailer_dashboard_cache', Date.now() - cacheStart)

    if (cacheResult.rows.length > 0) {
      await logActivity({
        userId: Number(session.user.id),
        action: 'retailer_viewed',
        retailerId,
        entityType: 'retailer',
        entityId: retailerId,
        details: { endpoint: 'overview', source: 'cache' },
      })

      const cached = cacheResult.rows[0].data
      return NextResponse.json(serializeAnalyticsData({ ...cached, source: 'cache' }))
    }

    const tableName = viewType === 'monthly' ? 'monthly_archive' : 'weekly_aggregates'
    const periodColumn = viewType === 'monthly' ? 'month_start' : 'week_start'

    const dataStart = Date.now()
    const dataResult = await queryAnalytics(
      `SELECT ${periodColumn} AS period_start,
              gmv,
              conversions,
              profit,
              roi,
              impressions,
              clicks,
              ctr,
              cvr,
              validation_rate
       FROM ${tableName}
       WHERE retailer_id = $1
       ORDER BY ${periodColumn} DESC
       LIMIT 13`,
      [retailerId]
    )
    logSlowQuery(`${tableName}`, Date.now() - dataStart)

    if (dataResult.rows.length === 0) {
      return NextResponse.json({ error: 'Overview data not found' }, { status: 404 })
    }

    const history = [...dataResult.rows].reverse()
    const latest = dataResult.rows[0]
    const previous = dataResult.rows[1]

    const comparisons = {
      gmv_change_pct: calculatePercentageChange(latest.gmv, previous?.gmv ?? null),
      conversions_change_pct: calculatePercentageChange(latest.conversions, previous?.conversions ?? null),
      profit_change_pct: calculatePercentageChange(latest.profit, previous?.profit ?? null),
      roi_change_pct: calculatePercentageChange(latest.roi, previous?.roi ?? null),
      impressions_change_pct: calculatePercentageChange(latest.impressions, previous?.impressions ?? null),
      clicks_change_pct: calculatePercentageChange(latest.clicks, previous?.clicks ?? null),
      ctr_change_pct: calculatePercentageChange(latest.ctr, previous?.ctr ?? null),
      cvr_change_pct: calculatePercentageChange(latest.cvr, previous?.cvr ?? null),
      validation_rate_change_pct: calculatePercentageChange(
        latest.validation_rate,
        previous?.validation_rate ?? null
      ),
    }

    const trend = {
      gmv: comparisons.gmv_change_pct === null ? 'flat' : comparisons.gmv_change_pct > 0 ? 'up' : comparisons.gmv_change_pct < 0 ? 'down' : 'flat',
      conversions:
        comparisons.conversions_change_pct === null
          ? 'flat'
          : comparisons.conversions_change_pct > 0
            ? 'up'
            : comparisons.conversions_change_pct < 0
              ? 'down'
              : 'flat',
      roi: comparisons.roi_change_pct === null ? 'flat' : comparisons.roi_change_pct > 0 ? 'up' : comparisons.roi_change_pct < 0 ? 'down' : 'flat',
    }

    const response = {
      retailer_id: retailerId,
      view_type: viewType,
      metrics: {
        gmv: latest.gmv,
        conversions: latest.conversions,
        profit: latest.profit,
        roi: latest.roi,
        impressions: latest.impressions,
        clicks: latest.clicks,
        ctr: latest.ctr,
        cvr: latest.cvr,
        validation_rate: latest.validation_rate,
      },
      history,
      comparisons,
      trend,
      source: 'live',
      last_updated: latest.period_start,
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'overview', source: 'live' },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching overview metrics:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch overview metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
