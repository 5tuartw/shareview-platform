'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatNumber } from '@/lib/utils'

type MetricKey = 'gmv' | 'profit' | 'impressions' | 'clicks' | 'conversions' | 'ctr' | 'cvr' | 'roi'

type CohortDomain = {
  key: string
  label: string
  options: Array<{ value: string; count: number }>
}

type CohortMetadataResponse = {
  domains: CohortDomain[]
  default_filters: Record<string, string[]>
  default_include_provisional: boolean
}

type CohortDataResponse = {
  cohort_summary: {
    matched_count: number
    confirmed_count: number
    provisional_count: number
    small_sample: boolean
  }
  series: {
    cohort_median: Array<{ period_start: string; value: number | null }>
    cohort_p25: Array<{ period_start: string; value: number | null }>
    cohort_p75: Array<{ period_start: string; value: number | null }>
  }
}

type OverviewChartPoint = {
  label: string
  periodStart: string
  gmv: number
  commission: number
  conversions: number
  cvr: number
  impressions: number
  clicks: number
  roi: number
  profit: number
}

interface MarketComparisonPanelProps {
  retailerId: string
  apiBase?: string
  overviewView: 'weekly' | 'monthly'
  period: string
  weekPeriod: string
  windowSize: number
  data: OverviewChartPoint[]
}

const METRIC_OPTIONS: Array<{ key: MetricKey; label: string }> = [
  { key: 'gmv', label: 'GMV' },
  { key: 'profit', label: 'Profit' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cvr', label: 'CVR' },
  { key: 'roi', label: 'ROI' },
]

const toPercentMetric = (metric: MetricKey) => metric === 'ctr' || metric === 'cvr' || metric === 'roi'

const formatMetricValue = (metric: MetricKey, value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'No data'
  if (metric === 'gmv' || metric === 'profit') return formatCurrency(value)
  if (metric === 'impressions' || metric === 'clicks' || metric === 'conversions') return formatNumber(Math.round(value))
  return `${value.toFixed(2)}%`
}

const getRetailerMetricValue = (row: OverviewChartPoint, metric: MetricKey): number => {
  switch (metric) {
    case 'gmv':
      return row.gmv
    case 'profit':
      return row.profit
    case 'impressions':
      return row.impressions
    case 'clicks':
      return row.clicks
    case 'conversions':
      return row.conversions
    case 'ctr':
      return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0
    case 'cvr':
      return row.cvr
    case 'roi':
      return row.roi
    default:
      return 0
  }
}

const toggleFilterValue = (filters: Record<string, string[]>, domainKey: string, value: string): Record<string, string[]> => {
  const existing = new Set(filters[domainKey] ?? [])
  if (existing.has(value)) {
    existing.delete(value)
  } else {
    existing.add(value)
  }

  const next = {
    ...filters,
    [domainKey]: Array.from(existing),
  }

  if (next[domainKey].length === 0) {
    delete next[domainKey]
  }

  return next
}

const toUtcDate = (value: string): Date => {
  const dateOnly = value.slice(0, 10)
  return new Date(`${dateOnly}T00:00:00Z`)
}

const formatMonthLabel = (periodStart: string, includeYear = true): string =>
  new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })

const formatWeekLabel = (periodStart: string, includeYear = false): string =>
  `w/c ${toUtcDate(periodStart).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })}`

const buildWeeklyPeriodsFromData = (
  dataPeriods: string[],
  anchorWeek: string,
  count: number
): string[] => {
  if (dataPeriods.length === 0) return []

  const uniqueSorted = Array.from(new Set(dataPeriods.map((value) => value.slice(0, 10)))).sort(
    (a, b) => toUtcDate(a).getTime() - toUtcDate(b).getTime()
  )

  let anchorIdx = uniqueSorted.length - 1
  const anchorTime = toUtcDate(anchorWeek).getTime()
  for (let i = uniqueSorted.length - 1; i >= 0; i -= 1) {
    if (toUtcDate(uniqueSorted[i]).getTime() <= anchorTime) {
      anchorIdx = i
      break
    }
  }

  const start = Math.max(0, anchorIdx - count + 1)
  return uniqueSorted.slice(start, anchorIdx + 1)
}

const buildPeriodsFromData = (
  dataPeriods: string[],
  anchorPeriodStart: string,
  count: number
): string[] => {
  if (dataPeriods.length === 0) return []

  const sparseSorted = Array.from(new Set(dataPeriods.map((value) => `${value.slice(0, 7)}-01`))).sort(
    (a, b) => toUtcDate(a).getTime() - toUtcDate(b).getTime()
  )

  if (sparseSorted.length === 0) return []

  const denseTimeline: string[] = []
  const cursor = toUtcDate(sparseSorted[0])
  const end = toUtcDate(sparseSorted[sparseSorted.length - 1])

  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getUTCFullYear()
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0')
    denseTimeline.push(`${year}-${month}-01`)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  let anchorIdx = denseTimeline.length - 1
  const anchorTime = toUtcDate(anchorPeriodStart).getTime()
  for (let i = denseTimeline.length - 1; i >= 0; i -= 1) {
    if (toUtcDate(denseTimeline[i]).getTime() <= anchorTime) {
      anchorIdx = i
      break
    }
  }

  const start = Math.max(0, anchorIdx - count + 1)
  return denseTimeline.slice(start, anchorIdx + 1)
}

export default function MarketComparisonPanel({ retailerId, apiBase, overviewView, period, weekPeriod, windowSize, data }: MarketComparisonPanelProps) {
  const [metric, setMetric] = useState<MetricKey>('gmv')
  const [domains, setDomains] = useState<CohortDomain[]>([])
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [includeProvisional, setIncludeProvisional] = useState(true)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cohortData, setCohortData] = useState<CohortDataResponse | null>(null)

  const endpoint = `${apiBase ?? '/api'}/retailers/${retailerId}/overview/market-comparison`

  const periodStarts = useMemo(() => {
    if (overviewView === 'monthly') {
      return buildPeriodsFromData(
        data.map((row) => row.periodStart),
        `${period.slice(0, 7)}-01`,
        windowSize
      )
    }

    const fallbackAnchor = data[data.length - 1]?.periodStart?.slice(0, 10)
    const anchor = weekPeriod || fallbackAnchor
    if (!anchor) return []

    return buildWeeklyPeriodsFromData(
      data.map((row) => row.periodStart),
      anchor,
      windowSize
    )
  }, [data, overviewView, period, weekPeriod, windowSize])

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setMetadataLoading(true)
        setError(null)

        const response = await fetch(endpoint, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Unable to load cohort options')
        }

        const payload = (await response.json()) as CohortMetadataResponse
        setDomains(payload.domains ?? [])
        setFilters(payload.default_filters ?? {})
        setIncludeProvisional(payload.default_include_provisional !== false)
      } catch (metadataError) {
        setError(metadataError instanceof Error ? metadataError.message : 'Unable to load cohort options')
      } finally {
        setMetadataLoading(false)
      }
    }

    loadMetadata()
  }, [endpoint])

  useEffect(() => {
    if (metadataLoading) return
    if (periodStarts.length === 0) return

    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            metric,
            view_type: overviewView,
            include_provisional: includeProvisional,
            period_starts: periodStarts,
            filters,
          }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error || 'Unable to load market comparison')
        }

        const payload = (await response.json()) as CohortDataResponse
        setCohortData(payload)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load market comparison')
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [endpoint, filters, includeProvisional, metadataLoading, metric, overviewView, periodStarts])

  const chartData = useMemo(() => {
    const medianMap = new Map((cohortData?.series.cohort_median ?? []).map((row) => [row.period_start.slice(0, 10), row.value]))
    const p25Map = new Map((cohortData?.series.cohort_p25 ?? []).map((row) => [row.period_start.slice(0, 10), row.value]))
    const p75Map = new Map((cohortData?.series.cohort_p75 ?? []).map((row) => [row.period_start.slice(0, 10), row.value]))

    const retailerByPeriod = new Map(
      data.map((row) => [row.periodStart.slice(0, 10), getRetailerMetricValue(row, metric)])
    )

    return periodStarts.map((periodKey, index) => {
      const parsed = toUtcDate(periodKey)
      const includeYear = index === 0 || parsed.getUTCMonth() === 0
      return {
        periodKey,
        label: overviewView === 'monthly'
          ? formatMonthLabel(periodKey, includeYear)
          : formatWeekLabel(periodKey, includeYear),
        retailer: retailerByPeriod.get(periodKey) ?? null,
        cohortMedian: medianMap.get(periodKey) ?? null,
        cohortP25: p25Map.get(periodKey) ?? null,
        cohortP75: p75Map.get(periodKey) ?? null,
      }
    })
  }, [cohortData, data, metric, overviewView, periodStarts])

  const noDataPeriodsCount = useMemo(() => {
    return chartData.reduce((count, point) => {
      return point.retailer === null && point.cohortMedian === null ? count + 1 : count
    }, 0)
  }, [chartData])

  const matchedCount = cohortData?.cohort_summary.matched_count ?? 0
  const smallSample = cohortData?.cohort_summary.small_sample ?? false

  const selectedFilterChips = useMemo(() => {
    const chips: Array<{ domainKey: string; label: string; value: string }> = []
    for (const domain of domains) {
      for (const value of filters[domain.key] ?? []) {
        chips.push({ domainKey: domain.key, label: domain.label, value })
      }
    }
    return chips
  }, [domains, filters])

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Metric</label>
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as MetricKey)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {METRIC_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeProvisional}
              onChange={(event) => setIncludeProvisional(event.target.checked)}
            />
            Include provisional profile tags
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-gray-700">
            Matched cohort: {matchedCount} other retailer{matchedCount === 1 ? '' : 's'}
          </span>
          {smallSample && (
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800">
              Small cohort, interpret with caution
            </span>
          )}
          {cohortData && cohortData.cohort_summary.provisional_count > 0 && includeProvisional && (
            <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-blue-800">
              Using provisional profile tags
            </span>
          )}
        </div>

        {selectedFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedFilterChips.map((chip) => (
              <button
                key={`${chip.domainKey}-${chip.value}`}
                type="button"
                onClick={() => setFilters((current) => toggleFilterValue(current, chip.domainKey, chip.value))}
                className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                {chip.label}: {chip.value} ({matchedCount})
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFilters({})}
              className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Clear filters
            </button>
          </div>
        )}

        {metadataLoading ? (
          <p className="text-sm text-gray-500">Loading cohort filters...</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {domains.map((domain) => (
              <div key={domain.key} className="rounded-md border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">{domain.label}</p>
                <div className="max-h-36 overflow-auto space-y-1 pr-1">
                  {domain.options.length === 0 ? (
                    <p className="text-xs text-gray-500">No values yet</p>
                  ) : (
                    domain.options.map((option) => {
                      const selected = (filters[domain.key] ?? []).includes(option.value)
                      return (
                        <label key={`${domain.key}-${option.value}`} className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-2 text-gray-700">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => setFilters((current) => toggleFilterValue(current, domain.key, option.value))}
                            />
                            {option.value}
                          </span>
                          <span className="text-gray-400">{option.count}</span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`bg-white border border-gray-200 rounded-lg p-4 transition-opacity ${matchedCount === 0 ? 'opacity-50' : 'opacity-100'}`}>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {matchedCount === 0 && !loading ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-3">
            No matching cohorts. Remove one or more filters to continue.
          </div>
        ) : null}

        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Retailer vs Cohort Trend</h3>
        {overviewView === 'monthly' && noDataPeriodsCount > 0 && (
          <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {noDataPeriodsCount} month{noDataPeriodsCount === 1 ? '' : 's'} in this window have no source data and are shown as gaps.
          </p>
        )}

        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="#9CA3AF"
              tickFormatter={(value) => {
                if (metric === 'gmv' || metric === 'profit') return formatCurrency(Number(value))
                if (toPercentMetric(metric)) return `${Number(value).toFixed(1)}%`
                return formatNumber(Number(value))
              }}
            />
            <Tooltip
              labelFormatter={(_label, payload) => {
                const periodKey = payload?.[0]?.payload?.periodKey as string | undefined
                if (!periodKey) return _label
                return overviewView === 'monthly' ? formatMonthLabel(periodKey) : formatWeekLabel(periodKey)
              }}
              formatter={(value) => {
                if (value === null || value === undefined) {
                  return formatMetricValue(metric, null)
                }
                const numeric = Number(value)
                return formatMetricValue(metric, Number.isNaN(numeric) ? null : numeric)
              }}
              contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="cohortP75"
              name="Cohort P75"
              stroke="none"
              fill="#D1FAE5"
              fillOpacity={0.45}
            />
            <Area
              type="monotone"
              dataKey="cohortP25"
              name="Cohort P25"
              stroke="none"
              fill="#FFFFFF"
              fillOpacity={1}
            />
            <Line
              type="monotone"
              dataKey="retailer"
              name="This retailer"
              stroke="#111827"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="cohortMedian"
              name="Cohort median"
              stroke="#0EA5E9"
              strokeWidth={2}
              dot={false}
              strokeDasharray="6 3"
            />
          </ComposedChart>
        </ResponsiveContainer>

        {loading && <p className="mt-2 text-xs text-gray-500">Refreshing cohort comparison...</p>}
      </div>
    </div>
  )
}
