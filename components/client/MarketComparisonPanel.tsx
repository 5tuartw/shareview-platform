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
import GaugeComponent from 'react-gauge-component'
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
    metric_min?: number | null
    metric_max?: number | null
  }
  series: {
    cohort_median: Array<{ period_start: string; value: number | null }>
    cohort_p25: Array<{ period_start: string; value: number | null }>
    cohort_p75: Array<{ period_start: string; value: number | null }>
    cohort_min?: Array<{ period_start: string; value: number | null }>
    cohort_max?: Array<{ period_start: string; value: number | null }>
  }
}

type BenchmarkAggregate = {
  retailer: number | null
  cohortMedian: number | null
  cohortP25: number | null
  cohortP75: number | null
  cohortMin: number | null
  cohortMax: number | null
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

const toggleSelectionWithLimit = <T,>(items: T[], value: T, maxItems: number): T[] => {
  if (items.includes(value)) {
    return items.filter((item) => item !== value)
  }
  if (items.length >= maxItems) {
    return items
  }
  return [...items, value]
}

const averageNumbers = (values: Array<number | null | undefined>): number | null => {
  const numeric = values.filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value))
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

const benchmarkPosition = (value: number | null, min: number, max: number): number | null => {
  if (value === null) return null
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

const formatDeltaFromMedian = (metric: MetricKey, value: number | null, median: number | null): string => {
  if (value === null || median === null) return 'No comparison'
  const delta = value - median
  if (metric === 'gmv' || metric === 'profit') {
    const sign = delta >= 0 ? '+' : '-'
    return `${sign}${formatCurrency(Math.abs(delta))} vs median`
  }
  if (metric === 'impressions' || metric === 'clicks' || metric === 'conversions') {
    const sign = delta >= 0 ? '+' : '-'
    return `${sign}${formatNumber(Math.abs(Math.round(delta)))} vs median`
  }
  const sign = delta >= 0 ? '+' : '-'
  return `${sign}${Math.abs(delta).toFixed(2)}pp vs median`
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
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<MetricKey[]>(['gmv'])
  const [domains, setDomains] = useState<CohortDomain[]>([])
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [retailerAllocatedByDomain, setRetailerAllocatedByDomain] = useState<Record<string, string[]>>({})
  const [benchmarkDomainKeys, setBenchmarkDomainKeys] = useState<string[]>([])
  const [benchmarkDomainSelections, setBenchmarkDomainSelections] = useState<Record<string, string[]>>({})
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null)
  const [benchmarkByDomain, setBenchmarkByDomain] = useState<Record<string, Partial<Record<MetricKey, BenchmarkAggregate>>>>({})
  const [visualPreviewDomain, setVisualPreviewDomain] = useState<string>('')
  const [visualPreviewMetric, setVisualPreviewMetric] = useState<MetricKey>('gmv')
  const [distributionDomainKeys, setDistributionDomainKeys] = useState<string[]>([])
  const [rangeStartIdx, setRangeStartIdx] = useState(0)
  const [rangeEndIdx, setRangeEndIdx] = useState(0)
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
        setRetailerAllocatedByDomain(payload.default_filters ?? {})
        setBenchmarkDomainSelections(payload.default_filters ?? {})
        const preferredDomains = (payload.domains ?? [])
          .filter((domain) => (payload.default_filters?.[domain.key] ?? []).length > 0)
          .map((domain) => domain.key)
        const fallbackDomains = (payload.domains ?? []).map((domain) => domain.key)
        const initialDomainKeys = (preferredDomains.length > 0 ? preferredDomains : fallbackDomains).slice(0, 4)
        setBenchmarkDomainKeys(initialDomainKeys)
        setDistributionDomainKeys(initialDomainKeys)
        setVisualPreviewDomain(initialDomainKeys[0] ?? '')
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

  useEffect(() => {
    if (periodStarts.length === 0) {
      setRangeStartIdx(0)
      setRangeEndIdx(0)
      return
    }

    setRangeStartIdx(0)
    setRangeEndIdx(periodStarts.length - 1)
  }, [periodStarts])

  const selectedPeriodStarts = useMemo(() => {
    if (periodStarts.length === 0) return []
    const safeStart = Math.max(0, Math.min(rangeStartIdx, periodStarts.length - 1))
    const safeEnd = Math.max(0, Math.min(rangeEndIdx, periodStarts.length - 1))
    const start = Math.min(safeStart, safeEnd)
    const end = Math.max(safeStart, safeEnd)
    return periodStarts.slice(start, end + 1)
  }, [periodStarts, rangeStartIdx, rangeEndIdx])

  useEffect(() => {
    if (metadataLoading) return
    if (benchmarkDomainKeys.length === 0 || benchmarkMetrics.length === 0 || selectedPeriodStarts.length === 0) {
      setBenchmarkByDomain({})
      return
    }

    const run = async () => {
      try {
        setBenchmarkLoading(true)
        setBenchmarkError(null)

        const selectedSet = new Set(selectedPeriodStarts.map((value) => value.slice(0, 10)))

        const requestSpecs = benchmarkDomainKeys.flatMap((domainKey) =>
          benchmarkMetrics.map((metricKey) => ({ domainKey, metricKey }))
        )

        const responses = await Promise.all(
          requestSpecs.map(async ({ domainKey, metricKey }) => {
            const selectedValues = benchmarkDomainSelections[domainKey] ?? []
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                metric: metricKey,
                view_type: overviewView,
                include_provisional: includeProvisional,
                period_starts: selectedPeriodStarts,
                filters: selectedValues.length > 0 ? { [domainKey]: selectedValues } : {},
              }),
            })

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: string } | null
              throw new Error(payload?.error || 'Unable to load horizontal benchmark view')
            }

            const payload = (await response.json()) as CohortDataResponse

            const retailerValues = data
              .filter((row) => selectedSet.has(row.periodStart.slice(0, 10)))
              .map((row) => getRetailerMetricValue(row, metricKey))

            const cohortMedianValues = payload.series.cohort_median
              .filter((row) => selectedSet.has(row.period_start.slice(0, 10)))
              .map((row) => row.value)

            const cohortP25Values = payload.series.cohort_p25
              .filter((row) => selectedSet.has(row.period_start.slice(0, 10)))
              .map((row) => row.value)

            const cohortP75Values = payload.series.cohort_p75
              .filter((row) => selectedSet.has(row.period_start.slice(0, 10)))
              .map((row) => row.value)

            return {
              domainKey,
              metricKey,
              aggregate: {
                retailer: averageNumbers(retailerValues),
                cohortMedian: averageNumbers(cohortMedianValues),
                cohortP25: averageNumbers(cohortP25Values),
                cohortP75: averageNumbers(cohortP75Values),
                cohortMin: payload.cohort_summary.metric_min ?? null,
                cohortMax: payload.cohort_summary.metric_max ?? null,
              } satisfies BenchmarkAggregate,
            }
          })
        )

        const next: Record<string, Partial<Record<MetricKey, BenchmarkAggregate>>> = {}
        for (const item of responses) {
          if (!next[item.domainKey]) {
            next[item.domainKey] = {}
          }
          next[item.domainKey][item.metricKey] = item.aggregate
        }
        setBenchmarkByDomain(next)
      } catch (requestError) {
        setBenchmarkError(requestError instanceof Error ? requestError.message : 'Unable to load horizontal benchmark view')
      } finally {
        setBenchmarkLoading(false)
      }
    }

    run()
  }, [
    metadataLoading,
    benchmarkDomainKeys,
    benchmarkMetrics,
    selectedPeriodStarts,
    benchmarkDomainSelections,
    endpoint,
    overviewView,
    includeProvisional,
    data,
  ])

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

  const selectedDomainLabels = useMemo(() => {
    const labelByKey = new Map(domains.map((domain) => [domain.key, domain.label]))
    return benchmarkDomainKeys.map((key) => labelByKey.get(key) ?? key)
  }, [benchmarkDomainKeys, domains])

  const periodRangeLabel = useMemo(() => {
    if (selectedPeriodStarts.length === 0) return 'No period selected'
    const startPeriod = selectedPeriodStarts[0]
    const endPeriod = selectedPeriodStarts[selectedPeriodStarts.length - 1]
    if (overviewView === 'monthly') {
      return `${formatMonthLabel(startPeriod)} to ${formatMonthLabel(endPeriod)}`
    }
    return `${formatWeekLabel(startPeriod, true)} to ${formatWeekLabel(endPeriod, true)}`
  }, [overviewView, selectedPeriodStarts])

  const visualPreviewAggregate = useMemo(() => {
    if (!visualPreviewDomain) return null
    return benchmarkByDomain[visualPreviewDomain]?.[visualPreviewMetric] ?? null
  }, [benchmarkByDomain, visualPreviewDomain, visualPreviewMetric])

  const visualPreviewDomainLabel = useMemo(() => {
    if (!visualPreviewDomain) return 'Select a domain'
    return domains.find((domain) => domain.key === visualPreviewDomain)?.label ?? visualPreviewDomain
  }, [domains, visualPreviewDomain])

  const visualPreviewScale = useMemo(() => {
    if (!visualPreviewAggregate) {
      return {
        min: 0,
        max: 1,
      }
    }

    const values = [
      visualPreviewAggregate.cohortMin,
      visualPreviewAggregate.cohortP25,
      visualPreviewAggregate.cohortMedian,
      visualPreviewAggregate.cohortP75,
      visualPreviewAggregate.cohortMax,
      visualPreviewAggregate.retailer,
    ].filter((value): value is number => value !== null)

    if (values.length === 0) {
      return {
        min: 0,
        max: 1,
      }
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    return {
      min,
      max: max === min ? min + 1 : max,
    }
  }, [visualPreviewAggregate])

  const distributionRows = useMemo(() => {
    const labelByKey = new Map(domains.map((domain) => [domain.key, domain.label]))
    return distributionDomainKeys
      .map((domainKey) => {
        const aggregate = benchmarkByDomain[domainKey]?.[visualPreviewMetric]
        if (!aggregate) return null
        return {
          domainKey,
          domainLabel: labelByKey.get(domainKey) ?? domainKey,
          aggregate,
        }
      })
      .filter((row): row is { domainKey: string; domainLabel: string; aggregate: BenchmarkAggregate } => row !== null)
  }, [benchmarkByDomain, distributionDomainKeys, domains, visualPreviewMetric])

  const distributionScale = useMemo(() => {
    const values = distributionRows.flatMap((row) => [
      row.aggregate.cohortMin,
      row.aggregate.cohortP25,
      row.aggregate.cohortMedian,
      row.aggregate.cohortP75,
      row.aggregate.cohortMax,
      row.aggregate.retailer,
    ]).filter((value): value is number => value !== null)

    if (values.length === 0) {
      return { min: 0, max: 1 }
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    return {
      min,
      max: max === min ? min + 1 : max,
    }
  }, [distributionRows])

  const toVerticalPercent = (value: number | null): number | null => {
    if (value === null) return null
    const horizontal = benchmarkPosition(value, visualPreviewScale.min, visualPreviewScale.max)
    if (horizontal === null) return null
    return 100 - horizontal
  }

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

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Horizontal benchmarking view</h3>
            <p className="text-xs text-gray-500 mt-1">Pick up to three metrics and compare this retailer against domain cohorts for an aggregated period range.</p>
          </div>
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 list-none">
              Domains ({benchmarkDomainKeys.length} selected)
            </summary>
            <div className="absolute right-0 z-10 mt-2 max-h-72 w-72 overflow-auto rounded-md border border-gray-200 bg-white p-3 shadow-lg">
              <div className="space-y-1">
                {domains.map((domain) => {
                  const checked = benchmarkDomainKeys.includes(domain.key)
                  const hasRetailerAllocation = (retailerAllocatedByDomain[domain.key] ?? []).length > 0
                  return (
                    <label key={`domain-selector-${domain.key}`} className="flex items-center justify-between gap-3 rounded px-2 py-1 text-xs hover:bg-gray-50">
                      <span className="inline-flex items-center gap-2 text-gray-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setBenchmarkDomainKeys((current) => toggleSelectionWithLimit(current, domain.key, 8))}
                        />
                        {domain.label}
                      </span>
                      {hasRetailerAllocation && (
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          allocated
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          </details>
        </div>

        <div className="flex flex-wrap gap-2">
          {METRIC_OPTIONS.map((option) => {
            const selected = benchmarkMetrics.includes(option.key)
            return (
              <button
                key={`benchmark-metric-${option.key}`}
                type="button"
                onClick={() => setBenchmarkMetrics((current) => toggleSelectionWithLimit(current, option.key, 3))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected
                  ? 'border-[#1C1D1C] bg-[#1C1D1C] text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
            <span>Aggregation range ({overviewView})</span>
            <span className="font-medium text-gray-700">{periodRangeLabel}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, periodStarts.length - 1)}
            value={Math.min(rangeStartIdx, rangeEndIdx)}
            onChange={(event) => setRangeStartIdx(Number(event.target.value))}
            className="w-full"
            disabled={periodStarts.length <= 1}
          />
          <input
            type="range"
            min={0}
            max={Math.max(0, periodStarts.length - 1)}
            value={Math.max(rangeStartIdx, rangeEndIdx)}
            onChange={(event) => setRangeEndIdx(Number(event.target.value))}
            className="w-full"
            disabled={periodStarts.length <= 1}
          />
        </div>

        {benchmarkError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {benchmarkError}
          </div>
        )}

        {selectedDomainLabels.length > 0 && (
          <div className="text-xs text-gray-500">
            Selected domains: {selectedDomainLabels.join(', ')}
          </div>
        )}

        <div className="space-y-3">
          {benchmarkDomainKeys.map((domainKey) => {
            const domain = domains.find((item) => item.key === domainKey)
            if (!domain) return null
            const selectedValues = benchmarkDomainSelections[domain.key] ?? []
            return (
              <div key={`benchmark-panel-${domain.key}`} className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">{domain.label}</h4>
                  <div className="flex flex-wrap gap-1">
                    {domain.options.slice(0, 12).map((option) => {
                      const selected = selectedValues.includes(option.value)
                      const allocated = (retailerAllocatedByDomain[domain.key] ?? []).includes(option.value)
                      return (
                        <button
                          key={`domain-option-${domain.key}-${option.value}`}
                          type="button"
                          onClick={() => setBenchmarkDomainSelections((current) => toggleFilterValue(current, domain.key, option.value))}
                          className={`rounded-full border px-2 py-1 text-[11px] ${selected
                            ? 'border-slate-800 bg-slate-800 text-white'
                            : allocated
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-gray-300 bg-white text-gray-700'
                            }`}
                          title={allocated ? 'Allocated to this retailer' : undefined}
                        >
                          {option.value}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className={`grid grid-cols-1 gap-3 ${benchmarkMetrics.length > 1 ? 'md:grid-cols-2' : ''} ${benchmarkMetrics.length > 2 ? 'xl:grid-cols-3' : ''}`}>
                  {benchmarkMetrics.map((metricKey) => {
                    const aggregate = benchmarkByDomain[domain.key]?.[metricKey] ?? null
                    const candidates = [
                      aggregate?.retailer ?? null,
                      aggregate?.cohortMedian ?? null,
                      aggregate?.cohortP25 ?? null,
                      aggregate?.cohortP75 ?? null,
                    ].filter((value): value is number => value !== null)

                    const min = candidates.length > 0 ? Math.min(...candidates) : 0
                    const max = candidates.length > 0 ? Math.max(...candidates) : 1

                    const p25Pos = benchmarkPosition(aggregate?.cohortP25 ?? null, min, max)
                    const p75Pos = benchmarkPosition(aggregate?.cohortP75 ?? null, min, max)
                    const medianPos = benchmarkPosition(aggregate?.cohortMedian ?? null, min, max)
                    const retailerPos = benchmarkPosition(aggregate?.retailer ?? null, min, max)

                    return (
                      <div key={`benchmark-metric-view-${domain.key}-${metricKey}`} className="rounded-md border border-gray-200 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-800">{METRIC_OPTIONS.find((option) => option.key === metricKey)?.label}</span>
                          <span className="text-gray-500">{selectedPeriodStarts.length} period{selectedPeriodStarts.length === 1 ? '' : 's'}</span>
                        </div>

                        <div className="space-y-2">
                          <div className="relative h-8 rounded bg-gray-100">
                            {p25Pos !== null && p75Pos !== null && (
                              <div
                                className="absolute top-2 h-4 rounded bg-sky-100"
                                style={{ left: `${Math.min(p25Pos, p75Pos)}%`, width: `${Math.max(2, Math.abs(p75Pos - p25Pos))}%` }}
                              />
                            )}
                            {medianPos !== null && (
                              <div
                                className="absolute top-1 h-6 w-0.5 bg-sky-600"
                                style={{ left: `${medianPos}%` }}
                              />
                            )}
                            {retailerPos !== null && (
                              <>
                                <div
                                  className="absolute top-0 h-8 w-0.5 bg-gray-900"
                                  style={{ left: `${retailerPos}%` }}
                                />
                                <span
                                  className="absolute -top-5 -translate-x-1/2 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white"
                                  style={{ left: `${retailerPos}%` }}
                                >
                                  You
                                </span>
                              </>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                            <span>Median: {formatMetricValue(metricKey, aggregate?.cohortMedian ?? null)}</span>
                            <span>P25/P75: {formatMetricValue(metricKey, aggregate?.cohortP25 ?? null)} / {formatMetricValue(metricKey, aggregate?.cohortP75 ?? null)}</span>
                            <span className="col-span-2 font-medium text-gray-800">You: {formatMetricValue(metricKey, aggregate?.retailer ?? null)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {benchmarkLoading && <p className="text-xs text-gray-500">Refreshing horizontal benchmark views...</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Design visual variants</h3>
            <p className="text-xs text-gray-500 mt-1">Three alternative styles rendered on the same page for rapid design comparison.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={visualPreviewDomain}
              onChange={(event) => setVisualPreviewDomain(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-xs"
            >
              {benchmarkDomainKeys.map((domainKey) => {
                const domain = domains.find((item) => item.key === domainKey)
                if (!domain) return null
                return (
                  <option key={`visual-domain-${domain.key}`} value={domain.key}>
                    {domain.label}
                  </option>
                )
              })}
            </select>
            <select
              value={visualPreviewMetric}
              onChange={(event) => setVisualPreviewMetric(event.target.value as MetricKey)}
              className="rounded-md border border-gray-300 px-3 py-2 text-xs"
            >
              {benchmarkMetrics.map((metricKey) => {
                const metricLabel = METRIC_OPTIONS.find((option) => option.key === metricKey)?.label ?? metricKey
                return (
                  <option key={`visual-metric-${metricKey}`} value={metricKey}>
                    {metricLabel}
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        {visualPreviewAggregate ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Style A: Ribbon benchmark</p>
              <p className="text-xs text-slate-600">{visualPreviewDomainLabel} • {METRIC_OPTIONS.find((option) => option.key === visualPreviewMetric)?.label}</p>
              {(() => {
                const values = [
                  visualPreviewAggregate.retailer,
                  visualPreviewAggregate.cohortMedian,
                  visualPreviewAggregate.cohortP25,
                  visualPreviewAggregate.cohortP75,
                ].filter((value): value is number => value !== null)
                const min = values.length > 0 ? Math.min(...values) : 0
                const max = values.length > 0 ? Math.max(...values) : 1
                const p25 = benchmarkPosition(visualPreviewAggregate.cohortP25, min, max)
                const p75 = benchmarkPosition(visualPreviewAggregate.cohortP75, min, max)
                const median = benchmarkPosition(visualPreviewAggregate.cohortMedian, min, max)
                const retailer = benchmarkPosition(visualPreviewAggregate.retailer, min, max)

                return (
                  <div className="relative h-10 rounded bg-white border border-slate-200">
                    {p25 !== null && p75 !== null && (
                      <div
                        className="absolute top-3 h-4 rounded bg-sky-100"
                        style={{ left: `${Math.min(p25, p75)}%`, width: `${Math.max(2, Math.abs(p75 - p25))}%` }}
                      />
                    )}
                    {median !== null && <div className="absolute top-1 h-8 w-0.5 bg-sky-700" style={{ left: `${median}%` }} />}
                    {retailer !== null && <div className="absolute top-0 h-10 w-1 rounded bg-slate-900" style={{ left: `${retailer}%` }} />}
                  </div>
                )
              })()}
              <p className="text-xs font-medium text-slate-800">You: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.retailer)}</p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Style B: Signal tiles</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-white/80 bg-white/90 p-2">
                  <p className="text-gray-500">You</p>
                  <p className="font-semibold text-gray-900">{formatMetricValue(visualPreviewMetric, visualPreviewAggregate.retailer)}</p>
                  <p className="text-[10px] text-gray-600">{formatDeltaFromMedian(visualPreviewMetric, visualPreviewAggregate.retailer, visualPreviewAggregate.cohortMedian)}</p>
                </div>
                <div className="rounded border border-white/80 bg-white/90 p-2">
                  <p className="text-gray-500">Median</p>
                  <p className="font-semibold text-gray-900">{formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortMedian)}</p>
                  <p className="text-[10px] text-gray-600">Cohort centre</p>
                </div>
                <div className="rounded border border-white/80 bg-white/90 p-2">
                  <p className="text-gray-500">P25</p>
                  <p className="font-semibold text-gray-900">{formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortP25)}</p>
                </div>
                <div className="rounded border border-white/80 bg-white/90 p-2">
                  <p className="text-gray-500">P75</p>
                  <p className="font-semibold text-gray-900">{formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortP75)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Style C: Ladder track</p>
              {[
                { label: 'P25', value: visualPreviewAggregate.cohortP25, tone: 'bg-indigo-300' },
                { label: 'Median', value: visualPreviewAggregate.cohortMedian, tone: 'bg-indigo-500' },
                { label: 'P75', value: visualPreviewAggregate.cohortP75, tone: 'bg-indigo-700' },
                { label: 'You', value: visualPreviewAggregate.retailer, tone: 'bg-gray-900' },
              ].map((item) => {
                const values = [
                  visualPreviewAggregate.cohortP25,
                  visualPreviewAggregate.cohortMedian,
                  visualPreviewAggregate.cohortP75,
                  visualPreviewAggregate.retailer,
                ].filter((value): value is number => value !== null)
                const min = values.length > 0 ? Math.min(...values) : 0
                const max = values.length > 0 ? Math.max(...values) : 1
                const pos = benchmarkPosition(item.value, min, max)
                return (
                  <div key={`ladder-${item.label}`} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-indigo-900">
                      <span>{item.label}</span>
                      <span className="font-medium">{formatMetricValue(visualPreviewMetric, item.value)}</span>
                    </div>
                    <div className="h-2 rounded bg-white">
                      <div
                        className={`h-2 rounded ${item.tone}`}
                        style={{ width: `${Math.max(2, pos ?? 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Style D: Vertical box and whisker</p>
              <p className="text-xs text-rose-700/80">Classic distribution cue with median and your marker.</p>
              {(() => {
                const p25Top = toVerticalPercent(visualPreviewAggregate.cohortP25)
                const p75Top = toVerticalPercent(visualPreviewAggregate.cohortP75)
                const medianTop = toVerticalPercent(visualPreviewAggregate.cohortMedian)
                const retailerTop = toVerticalPercent(visualPreviewAggregate.retailer)

                return (
                  <div className="relative mx-auto h-56 w-28 rounded border border-rose-100 bg-white">
                    <div className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-rose-200" />
                    {p25Top !== null && p75Top !== null && (
                      <div
                        className="absolute left-1/2 w-12 -translate-x-1/2 rounded border border-rose-400 bg-rose-200/40"
                        style={{
                          top: `${Math.min(p25Top, p75Top)}%`,
                          height: `${Math.max(4, Math.abs(p25Top - p75Top))}%`,
                        }}
                      />
                    )}
                    {medianTop !== null && (
                      <div
                        className="absolute left-1/2 h-0.5 w-14 -translate-x-1/2 bg-rose-700"
                        style={{ top: `${medianTop}%` }}
                      />
                    )}
                    {p75Top !== null && (
                      <div
                        className="absolute left-1/2 h-0.5 w-7 -translate-x-1/2 bg-rose-500"
                        style={{ top: `${p75Top}%` }}
                      />
                    )}
                    {p25Top !== null && (
                      <div
                        className="absolute left-1/2 h-0.5 w-7 -translate-x-1/2 bg-rose-500"
                        style={{ top: `${p25Top}%` }}
                      />
                    )}
                    {retailerTop !== null && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2"
                        style={{ top: `calc(${retailerTop}% - 6px)` }}
                      >
                        <div className="h-3 w-3 rounded-full border border-white bg-gray-900 shadow" />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-rose-700">You</div>
                  </div>
                )
              })()}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-rose-900">
                <span>P25: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortP25)}</span>
                <span>P75: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortP75)}</span>
                <span>Median: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortMedian)}</span>
                <span>You: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.retailer)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Style E: Vertical benchmark pillars</p>
              <p className="text-xs text-amber-700/80">Tall-column treatment for decks and executive snapshots.</p>
              <div className="grid grid-cols-4 items-end gap-2">
                {[
                  { label: 'P25', value: visualPreviewAggregate.cohortP25, tone: 'bg-amber-200' },
                  { label: 'Median', value: visualPreviewAggregate.cohortMedian, tone: 'bg-amber-400' },
                  { label: 'P75', value: visualPreviewAggregate.cohortP75, tone: 'bg-amber-600' },
                  { label: 'You', value: visualPreviewAggregate.retailer, tone: 'bg-gray-900' },
                ].map((item) => {
                  const pos = benchmarkPosition(item.value, visualPreviewScale.min, visualPreviewScale.max)
                  return (
                    <div key={`pillar-${item.label}`} className="flex flex-col items-center gap-1">
                      <div className="flex h-40 w-full items-end rounded bg-white p-1">
                        <div
                          className={`w-full rounded ${item.tone}`}
                          style={{ height: `${Math.max(4, pos ?? 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-amber-900">{item.label}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-amber-900">{formatDeltaFromMedian(visualPreviewMetric, visualPreviewAggregate.retailer, visualPreviewAggregate.cohortMedian)}</p>
            </div>

            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Style F: Speed-o-metre dial</p>
              <p className="text-xs text-cyan-700/80">Min/Max on extremes, 25-75 percentile band highlighted, median tick, and retailer needle.</p>
              {(() => {
                const min = visualPreviewScale.min
                const max = visualPreviewScale.max
                const p25 = visualPreviewAggregate.cohortP25 ?? min
                const p75 = visualPreviewAggregate.cohortP75 ?? max
                const median = visualPreviewAggregate.cohortMedian ?? ((min + max) / 2)
                const retailer = visualPreviewAggregate.retailer ?? median
                const cohortMin = visualPreviewAggregate.cohortMin ?? min
                const cohortMax = visualPreviewAggregate.cohortMax ?? max

                return (
                  <div className="w-full max-w-[360px] mx-auto">
                    <GaugeComponent
                      type="semicircle"
                      minValue={min}
                      maxValue={max}
                      value={retailer}
                      startAngle={-90}
                      endAngle={90}
                      arc={{
                        width: 0.22,
                        padding: 0.01,
                        cornerRadius: 3,
                        subArcs: [
                          { limit: p25, color: '#CBD5E1' },
                          { limit: p75, color: '#06B6D4' },
                          { color: '#CBD5E1' },
                        ],
                        effects: { glow: false, innerShadow: false },
                      }}
                      pointer={{
                        type: 'needle',
                        color: '#111827',
                        length: 0.72,
                        width: 9,
                      }}
                      labels={{
                        valueLabel: {
                          formatTextValue: () => formatMetricValue(visualPreviewMetric, retailer),
                          style: {
                            fontSize: '18px',
                            fill: '#1F2937',
                            fontWeight: '700',
                          },
                        },
                        tickLabels: {
                          type: 'outer',
                          hideMinMax: false,
                          autoSpaceTickLabels: true,
                          ticks: [
                            {
                              value: cohortMin,
                              valueConfig: {
                                formatTextValue: () => `Min ${formatMetricValue(visualPreviewMetric, cohortMin)}`,
                              },
                            },
                            {
                              value: p25,
                              valueConfig: {
                                formatTextValue: () => `P25 ${formatMetricValue(visualPreviewMetric, p25)}`,
                              },
                            },
                            {
                              value: median,
                              valueConfig: {
                                formatTextValue: () => `Median ${formatMetricValue(visualPreviewMetric, median)}`,
                              },
                            },
                            {
                              value: p75,
                              valueConfig: {
                                formatTextValue: () => `P75 ${formatMetricValue(visualPreviewMetric, p75)}`,
                              },
                            },
                            {
                              value: cohortMax,
                              valueConfig: {
                                formatTextValue: () => `Max ${formatMetricValue(visualPreviewMetric, cohortMax)}`,
                              },
                            },
                          ],
                          defaultTickValueConfig: {
                            style: { fontSize: '10px', fill: '#334155', fontWeight: 600 },
                            hide: false,
                          },
                          defaultTickLineConfig: {
                            color: '#64748B',
                            length: 7,
                            width: 1,
                            hide: false,
                            distanceFromArc: 6,
                            distanceFromText: 6,
                          },
                        },
                      }}
                    />
                  </div>
                )
              })()}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-cyan-900">
                <span>P25: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortP25)}</span>
                <span>P75: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortP75)}</span>
                <span>Median: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.cohortMedian)}</span>
                <span>You: {formatMetricValue(visualPreviewMetric, visualPreviewAggregate.retailer)}</span>
              </div>
            </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Style G: Domain distribution strip</p>
                  <p className="text-xs text-slate-600 mt-1">X-axis is {METRIC_OPTIONS.find((option) => option.key === visualPreviewMetric)?.label}; rows are selected domains.</p>
                </div>
                <details className="relative">
                  <summary className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 list-none">
                    Domains for chart ({distributionDomainKeys.length})
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 max-h-72 w-72 overflow-auto rounded-md border border-gray-200 bg-white p-3 shadow-lg">
                    <div className="space-y-1">
                      {domains.map((domain) => {
                        const checked = distributionDomainKeys.includes(domain.key)
                        const allocated = (retailerAllocatedByDomain[domain.key] ?? []).length > 0
                        return (
                          <label key={`distribution-domain-${domain.key}`} className="flex items-center justify-between gap-3 rounded px-2 py-1 text-xs hover:bg-gray-50">
                            <span className="inline-flex items-center gap-2 text-gray-700">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setDistributionDomainKeys((current) => toggleSelectionWithLimit(current, domain.key, 8))}
                              />
                              {domain.label}
                            </span>
                            {allocated && (
                              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                allocated
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </details>
              </div>

              <div className="space-y-2">
                <div className="ml-40 mr-2 grid grid-cols-5 text-[11px] text-slate-500">
                  {[0, 25, 50, 75, 100].map((pct) => {
                    const value = distributionScale.min + ((distributionScale.max - distributionScale.min) * pct) / 100
                    return (
                      <span key={`distribution-axis-${pct}`} className={`${pct === 0 ? 'text-left' : pct === 100 ? 'text-right' : 'text-center'}`}>
                        {formatMetricValue(visualPreviewMetric, value)}
                      </span>
                    )
                  })}
                </div>

                {distributionRows.map((row) => {
                  const p25Pos = benchmarkPosition(row.aggregate.cohortP25, distributionScale.min, distributionScale.max)
                  const p75Pos = benchmarkPosition(row.aggregate.cohortP75, distributionScale.min, distributionScale.max)
                  const medianPos = benchmarkPosition(row.aggregate.cohortMedian, distributionScale.min, distributionScale.max)
                  const youPos = benchmarkPosition(row.aggregate.retailer, distributionScale.min, distributionScale.max)

                  return (
                    <div key={`distribution-row-${row.domainKey}`} className="flex items-center gap-3">
                      <div className="w-36 shrink-0 text-sm text-slate-800">{row.domainLabel}</div>
                      <div className="relative h-10 flex-1 rounded border border-slate-200 bg-white">
                        {[0, 25, 50, 75, 100].map((pct) => (
                          <div
                            key={`distribution-grid-${row.domainKey}-${pct}`}
                            className="absolute inset-y-0 w-px bg-slate-100"
                            style={{ left: `${pct}%` }}
                          />
                        ))}
                        {p25Pos !== null && p75Pos !== null && (
                          <div
                            className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-slate-300"
                            style={{ left: `${Math.min(p25Pos, p75Pos)}%`, width: `${Math.max(2, Math.abs(p75Pos - p25Pos))}%` }}
                            title={`P25 to P75: ${formatMetricValue(visualPreviewMetric, row.aggregate.cohortP25)} to ${formatMetricValue(visualPreviewMetric, row.aggregate.cohortP75)}`}
                          />
                        )}
                        {medianPos !== null && (
                          <div
                            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-600 shadow"
                            style={{ left: `${medianPos}%` }}
                            title={`Median: ${formatMetricValue(visualPreviewMetric, row.aggregate.cohortMedian)}`}
                          />
                        )}
                        {youPos !== null && (
                          <div
                            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-slate-900 shadow"
                            style={{ left: `${youPos}%` }}
                            title={`You: ${formatMetricValue(visualPreviewMetric, row.aggregate.retailer)}`}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-8 rounded bg-slate-300" />P25 to P75</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-600" />Median</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-900" />You</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">Select at least one domain and one metric to preview visual variants.</p>
        )}
      </div>
    </div>
  )
}
