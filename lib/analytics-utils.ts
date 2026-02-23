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
