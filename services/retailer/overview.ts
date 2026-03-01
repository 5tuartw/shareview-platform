import { queryAnalytics, getAnalyticsNetworkId } from '@/lib/db'
import { calculatePercentageChange, serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

export interface OverviewServiceResult {
  data: unknown
  status: number
}

export async function getRetailerOverview(
  retailerId: string,
  searchParams: URLSearchParams
): Promise<OverviewServiceResult> {
  const networkId = await getAnalyticsNetworkId(retailerId)
  if (!networkId) {
    return { data: { error: 'Retailer mapping not found' }, status: 404 }
  }

  const period = searchParams.get('period')
  const viewTypeParam = searchParams.get('view_type')
  const viewType = viewTypeParam
    ? viewTypeParam === 'monthly' ? 'monthly' : 'weekly'
    : period ? 'monthly' : 'weekly'
  const cachePeriodType = viewType === 'monthly' ? '13-months' : '13-weeks'

  let cacheResult: { rows: any[] } = { rows: [] }

  if (viewType === 'monthly') {
    const cacheStart = Date.now()
    cacheResult = await queryAnalytics(
      `SELECT total_gmv,
              total_profit,
              total_conversions,
              total_impressions,
              total_clicks,
              avg_roi,
              avg_validation_rate,
              avg_cvr,
              trend_data,
              last_updated,
              period_start_date,
              period_end_date
       FROM retailer_dashboard_cache
       WHERE retailer_id = $1
         AND period_type = $2
       ORDER BY last_updated DESC
       LIMIT 1`,
      [networkId, cachePeriodType]
    )
    logSlowQuery('retailer_dashboard_cache', Date.now() - cacheStart)
  }

  const loadCoverage = async () => ({
    percentage: 0,
    products_with_ads: 0,
    total_products: 0,
  })

  if (cacheResult.rows.length > 0) {
    const cached = cacheResult.rows[0]
    const rawTrend = Array.isArray(cached.trend_data) ? cached.trend_data : []
    const history = rawTrend.map((item: Record<string, unknown>) => {
      const impressions = Number(item.impressions ?? 0)
      const clicks = Number(item.clicks ?? 0)
      return {
        period_start: (
          item.period_start || item.date || item.month_start || item.week_start ||
          item.week_start_date || item.month || item.week || cached.period_start_date
        ) as string,
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
      ? [...history].sort((a: any, b: any) => Date.parse(a.period_start) - Date.parse(b.period_start))
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
      return {
        status: 200,
        data: serializeAnalyticsData({
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
            conversions: comparisons.conversions_change_pct === null ? 'flat' : comparisons.conversions_change_pct > 0 ? 'up' : comparisons.conversions_change_pct < 0 ? 'down' : 'flat',
            roi: comparisons.roi_change_pct === null ? 'flat' : comparisons.roi_change_pct > 0 ? 'up' : comparisons.roi_change_pct < 0 ? 'down' : 'flat',
          },
          source: 'cache',
          last_updated: cached.last_updated,
        }),
      }
    }
  }

  let dataResult
  let dataStart

  if (viewType === 'weekly') {
    dataStart = Date.now()
    dataResult = await queryAnalytics(
      `SELECT period_start_date AS period_start,
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
       FROM retailer_metrics
       WHERE retailer_id = $1
         AND period_start_date IS NOT NULL
         AND fetch_datetime = (SELECT MAX(fetch_datetime) FROM fetch_runs WHERE fetch_type = '13_weeks')
       ORDER BY period_start_date DESC
       LIMIT 13`,
      [networkId]
    )
    logSlowQuery('retailer_metrics (13_weeks)', Date.now() - dataStart)
  } else {
    dataStart = Date.now()
    const periodStart = period ? `${period}-01` : null
    dataResult = await queryAnalytics(
      `SELECT month_start AS period_start,
              gmv,
              conversions,
              profit,
              roi,
              impressions,
              clicks,
              ctr,
              cvr,
              validation_rate
       FROM monthly_archive
       WHERE retailer_id = $1
         AND ($2::date IS NULL OR month_start <= $2::date)
       ORDER BY month_start DESC
       LIMIT 13`,
      [networkId, periodStart]
    )
    logSlowQuery('monthly_archive', Date.now() - dataStart)
  }

  if (dataResult.rows.length === 0) {
    return { data: { error: 'Overview data not found' }, status: 404 }
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
    conversions: comparisons.conversions_change_pct === null ? 'flat' : comparisons.conversions_change_pct > 0 ? 'up' : comparisons.conversions_change_pct < 0 ? 'down' : 'flat',
    roi: comparisons.roi_change_pct === null ? 'flat' : comparisons.roi_change_pct > 0 ? 'up' : comparisons.roi_change_pct < 0 ? 'down' : 'flat',
  }

  const coverage = await loadCoverage()

  return {
    status: 200,
    data: serializeAnalyticsData({
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
    }),
  }
}
