const numericStringPattern = /^-?\d+(?:\.\d+)?$/

const isNumericString = (value: string): boolean => numericStringPattern.test(value)

const toNumber = (value: string): number => {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export const serializeAnalyticsData = (data: unknown): unknown => {
  if (data === null || data === undefined) return data

  if (data instanceof Date) {
    return data.toISOString()
  }

  if (Array.isArray(data)) {
    return data.map((item) => serializeAnalyticsData(item))
  }

  if (typeof data === 'string' && isNumericString(data)) {
    return toNumber(data)
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeAnalyticsData(value)
    }
    return result
  }

  return data
}

export const parsePeriod = (period: string): { start: Date; end: Date } => {
  const [year, month] = period.split('-').map((part) => Number(part))
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  return { start, end }
}

export const parsePeriodParam = (period: string): { periodStart: string; periodEnd: string } => {
  const [year, month] = period.split('-').map((part) => Number(part))
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 0))
  return {
    periodStart: start.toISOString().split('T')[0],
    periodEnd: end.toISOString().split('T')[0],
  }
}

export const calculatePercentageChange = (
  current: number | null | undefined,
  previous: number | null | undefined
): number | null => {
  if (current == null || previous == null || previous === 0) {
    return null
  }
  return ((current - previous) / previous) * 100
}

export const buildDateRange = (days: number, endDate?: Date): { start: Date; end: Date } => {
  const end = endDate ? new Date(endDate) : new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - Math.max(days - 1, 0))
  return { start, end }
}

export interface AvailableMonth {
  period: string
  actualStart: string | null
  actualEnd: string | null
}

export interface AvailableWeek {
  period: string
  label: string
}

type AvailabilityDomain = 'overview' | 'keywords' | 'categories' | 'products' | 'auctions'

export const getSnapshotDateBounds = async (
  retailerId: string,
  rangeType: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{ actualStart: string | null; actualEnd: string | null }> => {
  if (typeof window !== 'undefined') {
    return { actualStart: null, actualEnd: null }
  }

  const { query } = await import('@/lib/db')
  const result = await query<{
    actual_data_start: string | null
    actual_data_end: string | null
  }>(
    `SELECT actual_data_start, actual_data_end
     FROM keywords_snapshots
     WHERE retailer_id = $1
       AND range_type = $2
       AND range_start = $3::date
       AND range_end = $4::date
     LIMIT 1`,
    [retailerId, rangeType, rangeStart, rangeEnd]
  )

  if (result.rows.length === 0) {
    return { actualStart: null, actualEnd: null }
  }

  return {
    actualStart: result.rows[0].actual_data_start,
    actualEnd: result.rows[0].actual_data_end,
  }
}

export const getAvailableMonthsWithBounds = async (
  retailerId: string,
  domain: AvailabilityDomain = 'keywords'
): Promise<AvailableMonth[]> => {
  if (typeof window !== 'undefined') {
    return []
  }

  const { query } = await import('@/lib/db')

  const persisted = await query<{
    period: string
    actual_data_start: string | null
    actual_data_end: string | null
  }>(
    `SELECT period,
            actual_data_start,
            actual_data_end
     FROM retailer_data_availability
     WHERE retailer_id = $1
       AND domain = $2
       AND granularity = 'month'
     ORDER BY period_start ASC`,
    [retailerId, domain]
  )

  if (persisted.rows.length > 0) {
    return persisted.rows.map((row) => ({
      period: row.period,
      actualStart: row.actual_data_start,
      actualEnd: row.actual_data_end,
    }))
  }

  if (domain === 'overview') {
    const { getAnalyticsNetworkId, queryAnalytics } = await import('@/lib/db')
    const networkId = await getAnalyticsNetworkId(retailerId)
    if (!networkId) return []

    const result = await queryAnalytics<{ period: string }>(
      `SELECT DISTINCT month_year AS period
       FROM monthly_archive
       WHERE retailer_id = $1
       ORDER BY month_year ASC`,
      [networkId]
    )

    return result.rows.map((row) => ({
      period: row.period,
      actualStart: null,
      actualEnd: null,
    }))
  }

  const tableByDomain: Record<Exclude<AvailabilityDomain, 'overview'>, string> = {
    keywords: 'keywords_snapshots',
    categories: 'category_performance_snapshots',
    products: 'product_performance_snapshots',
    auctions: 'auction_insights_snapshots',
  }

  const result = await query<{
    period: string
    actual_data_start: string | null
    actual_data_end: string | null
  }>(
    `SELECT to_char(range_start, 'YYYY-MM') AS period,
            actual_data_start,
            actual_data_end
     FROM ${tableByDomain[domain]}
     WHERE retailer_id = $1
       AND range_type = 'month'
     ORDER BY range_start ASC`,
    [retailerId]
  )

  return result.rows.map((row) => ({
    period: row.period,
    actualStart: row.actual_data_start,
    actualEnd: row.actual_data_end,
  }))
}

export const getAvailableWeeks = async (retailerId: string): Promise<AvailableWeek[]> => {
  if (typeof window !== 'undefined') {
    return []
  }

  const { query } = await import('@/lib/db')

  const persisted = await query<{ period: string }>(
    `SELECT period
     FROM retailer_data_availability
     WHERE retailer_id = $1
       AND domain = 'overview'
       AND granularity = 'week'
     ORDER BY period_start ASC`,
    [retailerId]
  )

  if (persisted.rows.length > 0) {
    return persisted.rows.map((row) => {
      const parsed = new Date(`${row.period}T00:00:00Z`)
      const label = Number.isNaN(parsed.getTime())
        ? 'w/c -'
        : `w/c ${parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`
      return {
        period: row.period,
        label,
      }
    })
  }

  const { getAnalyticsNetworkId, queryAnalytics } = await import('@/lib/db')
  const networkId = await getAnalyticsNetworkId(retailerId)
  if (!networkId) return []

  const result = await queryAnalytics<{ period: string }>(
    `SELECT DISTINCT TO_CHAR(rm.period_start_date, 'YYYY-MM-DD') AS period
     FROM retailer_metrics rm
     JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
     WHERE rm.retailer_id = $1
       AND rm.period_start_date IS NOT NULL
       AND fr.fetch_type = '13_weeks'
     ORDER BY period ASC`,
    [networkId]
  )

  return result.rows.map((row) => {
    const parsed = new Date(`${row.period}T00:00:00Z`)
    const label = Number.isNaN(parsed.getTime())
      ? 'w/c -'
      : `w/c ${parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`
    return {
      period: row.period,
      label,
    }
  })
}

export const validateTier = (tier: string): string | null => {
  const allowed = [
    'all',
    'star',
    'strong',
    'underperforming',
    'poor',
    'good',
    'dead',
    'average',
    'healthy',
    'attention',
    'broken',
  ]
  return allowed.includes(tier) ? tier : null
}

export const validateMetric = (metric: string): string | null => {
  const allowed = ['conversions', 'clicks', 'impressions']
  return allowed.includes(metric) ? metric : null
}

export const validateFilter = (filter: string): string | null => {
  const allowed = ['all', 'top_converters', 'lowest_converters', 'top_click_through', 'high_impressions_no_clicks']
  return allowed.includes(filter) ? filter : null
}

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(value)
}

export const formatPercentage = (value: number, decimals = 1): string => {
  return `${value.toFixed(decimals)}%`
}
