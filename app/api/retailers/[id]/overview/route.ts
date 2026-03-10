import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryAnalytics, getAnalyticsNetworkId } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import {
  calculatePercentageChange,
  getAvailableWeeks,
  getAvailableMonthsWithBounds,
  type AvailableMonth,
  type AvailableWeek,
  serializeAnalyticsData,
} from '@/lib/analytics-utils'

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
    const period = searchParams.get('period')
    const viewTypeParam = searchParams.get('view_type')
    // Prioritize explicit view_type parameter over period inference
    const viewType = viewTypeParam ? (viewTypeParam === 'monthly' ? 'monthly' : 'weekly')
      : (period ? 'monthly' : 'weekly')

    // Resolve overview month availability from the persisted table (pipeline-refreshed)
    // with analytics fallback handled in the helper.
    const availableMonths = (await getAvailableMonthsWithBounds(
      retailerId,
      'overview'
    )) as AvailableMonth[]
    const availableWeeks = (await getAvailableWeeks(retailerId)) as AvailableWeek[]

    const networkId = await getAnalyticsNetworkId(retailerId)
    if (!networkId) {
      const periodStart = period ? `${period}-01` : null
      const snapshotResult = await query(
        `SELECT range_start AS period_start,
                total_impressions AS impressions,
                total_clicks AS clicks,
                total_conversions AS conversions,
                overall_ctr AS ctr,
                overall_cvr AS cvr,
                last_updated
         FROM keywords_snapshots
         WHERE retailer_id = $1
           AND range_type = 'month'
           AND ($2::date IS NULL OR range_start <= $2::date)
         ORDER BY range_start ASC
         LIMIT 13`,
        [retailerId, periodStart]
      )

      if (snapshotResult.rows.length === 0) {
        return NextResponse.json({ error: 'Retailer mapping not found' }, { status: 404 })
      }

      const history = snapshotResult.rows.map((row: any) => ({
        period_start: row.period_start,
        gmv: 0,
        conversions: Number(row.conversions ?? 0),
        profit: 0,
        roi: 0,
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        ctr: Number(row.ctr ?? 0),
        cvr: Number(row.cvr ?? 0),
      }))

      const latest = history[history.length - 1]
      const previous = history[history.length - 2]

      const comparisons = {
        gmv_change_pct: calculatePercentageChange(latest.gmv, previous?.gmv ?? null),
        conversions_change_pct: calculatePercentageChange(latest.conversions, previous?.conversions ?? null),
        profit_change_pct: calculatePercentageChange(latest.profit, previous?.profit ?? null),
        roi_change_pct: calculatePercentageChange(latest.roi, previous?.roi ?? null),
        impressions_change_pct: calculatePercentageChange(latest.impressions, previous?.impressions ?? null),
        clicks_change_pct: calculatePercentageChange(latest.clicks, previous?.clicks ?? null),
        ctr_change_pct: calculatePercentageChange(latest.ctr, previous?.ctr ?? null),
        cvr_change_pct: calculatePercentageChange(latest.cvr, previous?.cvr ?? null),
        validation_rate_change_pct: null,
      }

      await logActivity({
        userId: Number(session.user.id),
        action: 'retailer_viewed',
        retailerId,
        entityType: 'retailer',
        entityId: retailerId,
        details: { endpoint: 'overview', source: 'snapshot_fallback' },
      })

      return NextResponse.json(
        serializeAnalyticsData({
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
            validation_rate: 0,
          },
          coverage: {
            percentage: 0,
            products_with_ads: 0,
            total_products: 0,
          },
          history,
          comparisons,
          trend: {
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
          },
          source: 'snapshot_fallback',
          last_updated: (snapshotResult.rows[snapshotResult.rows.length - 1] as any).last_updated,
          available_months: availableMonths,
          available_weeks: availableWeeks,
        })
      )
    }

    // Skip cache for both weekly and monthly views — always query live data
    // (retailer_dashboard_cache trend_data was built with stale/incorrect sources)
    const cacheResult: { rows: any[] } = { rows: [] }

    const loadCoverage = async () => {
      // Coverage snapshots not yet implemented
      return {
        percentage: 0,
        products_with_ads: 0,
        total_products: 0,
      }
    }

    if (cacheResult.rows.length > 0) {
      const cached = cacheResult.rows[0]
      const rawTrend = Array.isArray(cached.trend_data) ? cached.trend_data : []
      const history = rawTrend.map((item: Record<string, unknown>) => {
        const impressions = Number(item.impressions ?? 0)
        const clicks = Number(item.clicks ?? 0)
        return {
          period_start:
            (item.period_start || item.date || item.month_start || item.week_start || item.week_start_date || item.month || item.week || cached.period_start_date) as string,
          gmv: Number(item.gmv ?? 0),
          conversions: Number(item.conversions ?? 0),
          profit: Number(item.profit ?? 0),
          roi: Number(item.roi ?? 0),
          impressions,
          clicks,
          ctr: Number(item.ctr ?? (impressions > 0 ? (clicks / impressions) * 100 : 0)),
          cvr: Number(item.cvr ?? 0),
        }
      })

      const hasSortableDates = history.every((row: any) => !Number.isNaN(Date.parse(row.period_start)))
      const sortedHistory = hasSortableDates
        ? [...history].sort(
          (a: any, b: any) => Date.parse(a.period_start) - Date.parse(b.period_start)
        )
        : history

      const latest = sortedHistory[sortedHistory.length - 1]
      const previous = sortedHistory[sortedHistory.length - 2]

      if (latest) {
        const comparisons = {
          gmv_change_pct: calculatePercentageChange(latest.gmv, previous?.gmv ?? null),
          conversions_change_pct: calculatePercentageChange(latest.conversions, previous?.conversions ?? null),
          profit_change_pct: calculatePercentageChange(latest.profit, previous?.profit ?? null),
          roi_change_pct: calculatePercentageChange(latest.roi, previous?.roi ?? null),
          impressions_change_pct: calculatePercentageChange(latest.impressions, previous?.impressions ?? null),
          clicks_change_pct: calculatePercentageChange(latest.clicks, previous?.clicks ?? null),
          ctr_change_pct: calculatePercentageChange(latest.ctr, previous?.ctr ?? null),
          cvr_change_pct: calculatePercentageChange(latest.cvr, previous?.cvr ?? null),
          validation_rate_change_pct: null,
        }

        const coverage = await loadCoverage()

        await logActivity({
          userId: Number(session.user.id),
          action: 'retailer_viewed',
          retailerId,
          entityType: 'retailer',
          entityId: retailerId,
          details: { endpoint: 'overview', source: 'cache' },
        })

        return NextResponse.json(
          serializeAnalyticsData({
            retailer_id: retailerId,
            view_type: viewType,
            metrics: {
              gmv: Number(cached.total_gmv ?? latest.gmv ?? 0),
              conversions: Number(cached.total_conversions ?? latest.conversions ?? 0),
              profit: Number(cached.total_profit ?? latest.profit ?? 0),
              roi: Number(cached.avg_roi ?? latest.roi ?? 0),
              impressions: Number(cached.total_impressions ?? latest.impressions ?? 0),
              clicks: Number(cached.total_clicks ?? latest.clicks ?? 0),
              ctr:
                Number(cached.total_impressions ?? 0) > 0
                  ? (Number(cached.total_clicks ?? 0) / Number(cached.total_impressions ?? 0)) * 100
                  : latest.ctr ?? 0,
              cvr: Number(cached.avg_cvr ?? latest.cvr ?? 0),
              validation_rate: Number(cached.avg_validation_rate ?? 0),
            },
            coverage,
            history: sortedHistory,
            comparisons,
            trend: {
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
            },
            source: 'cache',
            last_updated: cached.last_updated,
            available_months: availableMonths,
            available_weeks: availableWeeks,
          })
        )
      }
    }

    // For weekly view, use 13_weeks fetch runs; for monthly, use monthly_archive
    let dataResult
    let dataStart

    if (viewType === 'weekly') {
      // Query all available weekly data for this retailer.
      // Use DISTINCT ON (period_start_date) to get one row per week, preferring the
      // most recent fetch run so that re-imports don't produce duplicate points.
      dataStart = Date.now()
      dataResult = await queryAnalytics(
        `SELECT DISTINCT ON (rm.period_start_date)
                rm.period_start_date AS period_start,
                rm.gmv,
                rm.google_conversions_transaction AS conversions,
                rm.profit,
                rm.roi,
                rm.impressions,
                rm.google_clicks AS clicks,
                rm.ctr,
                rm.conversion_rate AS cvr,
                rm.validation_rate,
                rm.commission_validated AS commission
         FROM retailer_metrics rm
         JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
         WHERE rm.retailer_id = $1
           AND rm.period_start_date IS NOT NULL
           AND fr.fetch_type = '13_weeks'
         ORDER BY rm.period_start_date ASC, rm.fetch_datetime DESC`,
        [networkId]
      )
      logSlowQuery('retailer_metrics (all_weeks)', Date.now() - dataStart)
    } else {
      // Query 13 months of data from monthly_archive
      dataStart = Date.now()
      dataResult = await queryAnalytics(
        `SELECT TO_DATE(month_year, 'YYYY-MM') AS period_start,
                gmv,
                google_conversions_transaction AS conversions,
                profit,
                roi,
                impressions,
                google_clicks AS clicks,
                ctr,
                conversion_rate AS cvr,
                validation_rate,
                commission_validated AS commission
         FROM monthly_archive
         WHERE retailer_id = $1
         ORDER BY month_year ASC
         LIMIT 13`,
        [networkId]
      )
      logSlowQuery('monthly_archive', Date.now() - dataStart)
    }

    if (dataResult.rows.length === 0) {
      return NextResponse.json({ error: 'Overview data not found' }, { status: 404 })
    }

    const history = dataResult.rows
    const latest = dataResult.rows[dataResult.rows.length - 1]
    const previous = dataResult.rows[dataResult.rows.length - 2]

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

    const coverage = await loadCoverage()

    const response = {
      retailer_id: retailerId,
      retailer_name: latest.retailer_name || 'Unknown Retailer',
      network: latest.network || '',
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
      coverage,
      history,
      comparisons,
      trend,
      source: 'live',
      last_updated: latest.period_start,
      available_months: availableMonths,
      available_weeks: availableWeeks,
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
