'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartSpline, ListFilterPlus } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { COLORS } from '@/lib/colors'

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
  candidate_profiles?: Array<{
    profile_status: 'confirmed' | 'pending_confirmation'
    domains: Record<string, string[]>
  }>
}

type CohortMatchMode = 'all' | 'any'

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

type DistributionTrendPoint = {
  periodKey: string
  label: string
  retailer: number | null
  cohortMedian: number | null
  cohortP25: number | null
  cohortP75: number | null
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

type SavedGraphMetric = MetricKey

type SavedMarketComparisonGraph = {
  id: number
  retailer_id?: string
  scope?: string
  name: string
  metric: SavedGraphMetric
  view_type: 'monthly' | 'weekly'
  period_start: string
  period_end: string
  include_provisional: boolean
  match_mode: CohortMatchMode
  filters: Record<string, string[]>
  position: number
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

type SavedGraphDraft = {
  name: string
  metric: SavedGraphMetric
  view_type: 'monthly' | 'weekly'
  period_start: string
  period_end: string
  include_provisional: boolean
  match_mode: CohortMatchMode
  filters: Record<string, string[]>
}

type SavedGraphSeriesPoint = {
  periodKey: string
  label: string
  retailer: number | null
  cohortMedian: number | null
  cohortP25: number | null
  cohortP75: number | null
}

interface MarketComparisonPanelProps {
  retailerId: string
  apiBase?: string
  overviewView: 'weekly' | 'monthly'
  period: string
  weekPeriod: string
  windowSize: number
  data: OverviewChartPoint[]
  isAdminView?: boolean
  reportId?: number
  snapshotSavedGraphs?: SavedMarketComparisonGraph[]
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

const STYLE_G_ROW_CONFIG: Array<{ domainKey: string; rowLabel: string }> = [
  { domainKey: 'retailer_format', rowLabel: 'Format' },
  { domainKey: 'primary_category', rowLabel: 'Category' },
  { domainKey: 'target_audience', rowLabel: 'Audience' },
  { domainKey: 'price_positioning', rowLabel: 'Price tier' },
  { domainKey: 'business_model', rowLabel: 'Brand position' },
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

const averageNumbers = (values: Array<number | null | undefined>): number | null => {
  const numeric = values.filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value))
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
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

export default function MarketComparisonPanel({
  retailerId,
  apiBase,
  overviewView,
  period,
  weekPeriod,
  windowSize,
  data,
  isAdminView = false,
  reportId,
  snapshotSavedGraphs = [],
}: MarketComparisonPanelProps) {
  const [metric, setMetric] = useState<MetricKey>('gmv')
  const [domains, setDomains] = useState<CohortDomain[]>([])
  const [retailerAllocatedByDomain, setRetailerAllocatedByDomain] = useState<Record<string, string[]>>({})
  const [benchmarkDomainSelections, setBenchmarkDomainSelections] = useState<Record<string, string[]>>({})
  const [visualPreviewMetric, setVisualPreviewMetric] = useState<MetricKey>('gmv')
  const [distributionRowAggregates, setDistributionRowAggregates] = useState<Record<string, BenchmarkAggregate>>({})
  const [distributionRowTrends, setDistributionRowTrends] = useState<Record<string, DistributionTrendPoint[]>>({})
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [distributionError, setDistributionError] = useState<string | null>(null)
  const [distributionMenusOpen, setDistributionMenusOpen] = useState<Record<string, boolean>>({})
  const [distributionTrendsOpen, setDistributionTrendsOpen] = useState<Record<string, boolean>>({})
  const [includeProvisional, setIncludeProvisional] = useState(true)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [cohortMatchMode, setCohortMatchMode] = useState<CohortMatchMode>('all')
  const [candidateProfiles, setCandidateProfiles] = useState<
    Array<{
      profile_status: 'confirmed' | 'pending_confirmation'
      domains: Record<string, string[]>
    }>
  >([])
  const [savedGraphs, setSavedGraphs] = useState<SavedMarketComparisonGraph[]>([])
  const [savedGraphsLoading, setSavedGraphsLoading] = useState(false)
  const [savedGraphsError, setSavedGraphsError] = useState<string | null>(null)
  const [savedGraphSeriesById, setSavedGraphSeriesById] = useState<Record<number, SavedGraphSeriesPoint[]>>({})
  const [savedGraphMenusOpen, setSavedGraphMenusOpen] = useState<Record<string, boolean>>({})
  const [savingGraph, setSavingGraph] = useState(false)
  const [editingGraphId, setEditingGraphId] = useState<number | null>(null)

  const endpoint = `${apiBase ?? '/api'}/retailers/${retailerId}/overview/market-comparison`
  const graphsEndpoint = `${endpoint}/graphs`

  const monthlyPeriodOptions = useMemo(() => {
    const unique = Array.from(new Set(data.map((row) => `${row.periodStart.slice(0, 7)}-01`)))
    return unique.sort((a, b) => toUtcDate(a).getTime() - toUtcDate(b).getTime())
  }, [data])

  const weeklyPeriodOptions = useMemo(() => {
    const unique = Array.from(new Set(data.map((row) => row.periodStart.slice(0, 10))))
    return unique.sort((a, b) => toUtcDate(a).getTime() - toUtcDate(b).getTime())
  }, [data])

  const defaultDraftViewType: 'monthly' | 'weekly' = overviewView === 'monthly' ? 'monthly' : 'weekly'
  const defaultPeriodStart = (defaultDraftViewType === 'monthly' ? monthlyPeriodOptions[0] : weeklyPeriodOptions[0]) ?? ''
  const defaultPeriodEnd = (defaultDraftViewType === 'monthly'
    ? monthlyPeriodOptions[monthlyPeriodOptions.length - 1]
    : weeklyPeriodOptions[weeklyPeriodOptions.length - 1]) ?? ''

  const [graphDraft, setGraphDraft] = useState<SavedGraphDraft>({
    name: '',
    metric: 'gmv',
    view_type: defaultDraftViewType,
    period_start: defaultPeriodStart,
    period_end: defaultPeriodEnd,
    include_provisional: true,
    match_mode: 'all',
    filters: {},
  })

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

        const response = await fetch(endpoint, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Unable to load cohort options')
        }

        const payload = (await response.json()) as CohortMetadataResponse
        setDomains(payload.domains ?? [])
        setRetailerAllocatedByDomain(payload.default_filters ?? {})
        setBenchmarkDomainSelections(payload.default_filters ?? {})
        setCandidateProfiles(payload.candidate_profiles ?? [])
        setIncludeProvisional(payload.default_include_provisional !== false)
      } catch (metadataError) {
        setDistributionError(metadataError instanceof Error ? metadataError.message : 'Unable to load cohort options')
      } finally {
        setMetadataLoading(false)
      }
    }

    loadMetadata()
  }, [endpoint])

  useEffect(() => {
    if (reportId) {
      const ordered = [...snapshotSavedGraphs].sort((a, b) => a.position - b.position)
      setSavedGraphs(ordered)
      setSavedGraphsError(null)
      setSavedGraphsLoading(false)
      return
    }

    const loadSavedGraphs = async () => {
      try {
        setSavedGraphsLoading(true)
        setSavedGraphsError(null)
        const response = await fetch(graphsEndpoint, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Unable to load saved graphs')
        }

        const payload = (await response.json()) as SavedMarketComparisonGraph[]
        setSavedGraphs((payload ?? []).filter((graph) => graph.is_active !== false))
      } catch (graphError) {
        setSavedGraphsError(graphError instanceof Error ? graphError.message : 'Unable to load saved graphs')
      } finally {
        setSavedGraphsLoading(false)
      }
    }

    loadSavedGraphs()
  }, [graphsEndpoint, reportId, snapshotSavedGraphs])

  useEffect(() => {
    if (graphDraft.period_start && graphDraft.period_end) return

    const options = graphDraft.view_type === 'monthly' ? monthlyPeriodOptions : weeklyPeriodOptions
    if (options.length === 0) return

    setGraphDraft((current) => ({
      ...current,
      period_start: current.period_start || options[0],
      period_end: current.period_end || options[options.length - 1],
    }))
  }, [graphDraft.period_end, graphDraft.period_start, graphDraft.view_type, monthlyPeriodOptions, weeklyPeriodOptions])

  const selectedPeriodStarts = periodStarts

  const distributionRows = useMemo(() => {
    const domainOptionsByKey = new Map(domains.map((domain) => [domain.key, domain.options]))

    return STYLE_G_ROW_CONFIG.map((row) => {
      const selectedValues = benchmarkDomainSelections[row.domainKey] ?? []
      return {
        rowKey: row.domainKey,
        domainKey: row.domainKey,
        rowLabel: row.rowLabel,
        selectedValues,
        options: domainOptionsByKey.get(row.domainKey) ?? [],
        aggregate: distributionRowAggregates[row.domainKey] ?? null,
      }
    })
  }, [benchmarkDomainSelections, distributionRowAggregates, domains])

  useEffect(() => {
    if (metadataLoading || selectedPeriodStarts.length === 0) {
      setDistributionRowAggregates({})
      setDistributionRowTrends({})
      return
    }

    const rowSpecs = STYLE_G_ROW_CONFIG
      .map((row) => {
        const selectedValues = benchmarkDomainSelections[row.domainKey] ?? []
        return {
          domainKey: row.domainKey,
          selectedValues,
          rowKey: row.domainKey,
        }
      })
      .filter((row) => row.selectedValues.length > 0)

    if (rowSpecs.length === 0) {
      setDistributionRowAggregates({})
      setDistributionRowTrends({})
      return
    }

    const run = async () => {
      try {
        setDistributionLoading(true)
        setDistributionError(null)

        const selectedSet = new Set(selectedPeriodStarts.map((value) => value.slice(0, 10)))

        const responses = await Promise.all(
          rowSpecs.map(async ({ domainKey, selectedValues, rowKey }) => {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                metric: visualPreviewMetric,
                view_type: overviewView,
                include_provisional: includeProvisional,
                match_mode: cohortMatchMode,
                period_starts: selectedPeriodStarts,
                filters: { [domainKey]: selectedValues },
              }),
            })

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: string } | null
              throw new Error(payload?.error || 'Unable to load domain distribution rows')
            }

            const payload = (await response.json()) as CohortDataResponse

            const retailerValues = data
              .filter((row) => selectedSet.has(row.periodStart.slice(0, 10)))
              .map((row) => getRetailerMetricValue(row, visualPreviewMetric))

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
              rowKey,
              payload,
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

        const next: Record<string, BenchmarkAggregate> = {}
        const nextTrends: Record<string, DistributionTrendPoint[]> = {}
        for (const item of responses) {
          next[item.rowKey] = item.aggregate

          const medianMap = new Map(item.payload.series.cohort_median.map((point) => [point.period_start.slice(0, 10), point.value]))
          const p25Map = new Map(item.payload.series.cohort_p25.map((point) => [point.period_start.slice(0, 10), point.value]))
          const p75Map = new Map(item.payload.series.cohort_p75.map((point) => [point.period_start.slice(0, 10), point.value]))
          const retailerMap = new Map(
            data
              .filter((row) => selectedSet.has(row.periodStart.slice(0, 10)))
              .map((row) => [row.periodStart.slice(0, 10), getRetailerMetricValue(row, visualPreviewMetric)])
          )

          nextTrends[item.rowKey] = selectedPeriodStarts.map((periodStart, index) => {
            const parsed = toUtcDate(periodStart)
            const includeYear = index === 0 || parsed.getUTCMonth() === 0
            return {
              periodKey: periodStart,
              label: overviewView === 'monthly'
                ? formatMonthLabel(periodStart, includeYear)
                : formatWeekLabel(periodStart, includeYear),
              retailer: retailerMap.get(periodStart) ?? null,
              cohortMedian: medianMap.get(periodStart) ?? null,
              cohortP25: p25Map.get(periodStart) ?? null,
              cohortP75: p75Map.get(periodStart) ?? null,
            }
          })
        }
        setDistributionRowAggregates(next)
        setDistributionRowTrends(nextTrends)
      } catch (requestError) {
        setDistributionError(requestError instanceof Error ? requestError.message : 'Unable to load domain distribution rows')
      } finally {
        setDistributionLoading(false)
      }
    }

    run()
  }, [
    benchmarkDomainSelections,
    data,
    endpoint,
    includeProvisional,
    cohortMatchMode,
    metadataLoading,
    overviewView,
    selectedPeriodStarts,
    visualPreviewMetric,
  ])

  const eligibleCandidateProfiles = useMemo(() => {
    return candidateProfiles.filter((candidate) => includeProvisional || candidate.profile_status === 'confirmed')
  }, [candidateProfiles, includeProvisional])

  const buildOptionImpactMap = useCallback((selections: Record<string, string[]>): Record<string, Record<string, number>> => {
    const doesCandidateMatchSelections = (
      candidate: { domains: Record<string, string[]> },
      candidateSelections: Record<string, string[]>,
      mode: CohortMatchMode
    ): boolean => {
      const activeSelections = Object.entries(candidateSelections).filter(([, values]) => (values ?? []).length > 0)
      if (activeSelections.length === 0) return true

      let anyMatched = false
      for (const [domainKey, selectedValues] of activeSelections) {
        const candidateValues = new Set((candidate.domains[domainKey] ?? []).map((value) => value.trim().toLowerCase()))
        const selectedSet = new Set((selectedValues ?? []).map((value) => value.trim().toLowerCase()))

        let domainMatched = false
        for (const selected of selectedSet) {
          if (candidateValues.has(selected)) {
            domainMatched = true
            break
          }
        }

        if (mode === 'all' && !domainMatched) return false
        if (domainMatched) anyMatched = true
      }

      return mode === 'all' ? true : anyMatched
    }

    const addOptionToSelections = (
      currentSelections: Record<string, string[]>,
      domainKey: string,
      optionValue: string
    ): Record<string, string[]> => {
      const existing = new Set(currentSelections[domainKey] ?? [])
      existing.add(optionValue)
      return {
        ...currentSelections,
        [domainKey]: Array.from(existing),
      }
    }

    const baseMatched = new Set<number>()
    eligibleCandidateProfiles.forEach((candidate, index) => {
      if (doesCandidateMatchSelections(candidate, selections, cohortMatchMode)) {
        baseMatched.add(index)
      }
    })

    const impactMap: Record<string, Record<string, number>> = {}

    for (const domain of domains) {
      const perDomain: Record<string, number> = {}
      for (const option of domain.options) {
        const nextSelections = addOptionToSelections(selections, domain.key, option.value)
        let nextMatchedCount = 0
        let additionalCount = 0

        eligibleCandidateProfiles.forEach((candidate, index) => {
          const matches = doesCandidateMatchSelections(candidate, nextSelections, cohortMatchMode)
          if (!matches) return
          nextMatchedCount += 1
          if (!baseMatched.has(index)) {
            additionalCount += 1
          }
        })

        perDomain[option.value] = cohortMatchMode === 'any' ? additionalCount : nextMatchedCount
      }
      impactMap[domain.key] = perDomain
    }

    return impactMap
  }, [cohortMatchMode, domains, eligibleCandidateProfiles])

  const benchmarkOptionImpactMap = useMemo(() => {
    return buildOptionImpactMap(benchmarkDomainSelections)
  }, [benchmarkDomainSelections, buildOptionImpactMap])

  const distributionDeltaMax = useMemo(() => {
    const deltas = distributionRows
      .flatMap((row) => {
        const median = row.aggregate?.cohortMedian
        if (median == null) return []
        return [
          row.aggregate?.cohortP25,
          row.aggregate?.cohortP75,
          row.aggregate?.retailer,
        ]
          .filter((value): value is number => value !== null)
          .map((value) => Math.abs(value - median))
      })
      .filter((value) => Number.isFinite(value))

    if (deltas.length === 0) return 1
    const maxDelta = Math.max(...deltas)
    return maxDelta === 0 ? 1 : maxDelta
  }, [distributionRows])

  const graphPeriodOptions = graphDraft.view_type === 'monthly' ? monthlyPeriodOptions : weeklyPeriodOptions

  const buildGraphPeriods = useCallback((graph: SavedMarketComparisonGraph): string[] => {
    const start = graph.period_start.slice(0, 10)
    const end = graph.period_end.slice(0, 10)

    if (!start || !end || start > end) return []

    if (graph.view_type === 'monthly') {
      const periods: string[] = []
      const cursor = toUtcDate(`${start.slice(0, 7)}-01`)
      const final = toUtcDate(`${end.slice(0, 7)}-01`)
      while (cursor.getTime() <= final.getTime()) {
        const year = cursor.getUTCFullYear()
        const month = String(cursor.getUTCMonth() + 1).padStart(2, '0')
        periods.push(`${year}-${month}-01`)
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      }
      return periods
    }

    const periods: string[] = []
    const cursor = toUtcDate(start)
    const final = toUtcDate(end)
    while (cursor.getTime() <= final.getTime()) {
      const year = cursor.getUTCFullYear()
      const month = String(cursor.getUTCMonth() + 1).padStart(2, '0')
      const day = String(cursor.getUTCDate()).padStart(2, '0')
      periods.push(`${year}-${month}-${day}`)
      cursor.setUTCDate(cursor.getUTCDate() + 7)
    }
    return periods
  }, [])

  useEffect(() => {
    if (savedGraphs.length === 0) {
      setSavedGraphSeriesById({})
      return
    }

    const run = async () => {
      try {
        const results = await Promise.all(
          savedGraphs.map(async (graph) => {
            const periodStarts = buildGraphPeriods(graph)
            if (periodStarts.length === 0) {
              return { graphId: graph.id, points: [] as SavedGraphSeriesPoint[] }
            }

            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                metric: graph.metric,
                view_type: graph.view_type,
                include_provisional: graph.include_provisional,
                match_mode: graph.match_mode,
                period_starts: periodStarts,
                filters: graph.filters,
              }),
            })

            if (!response.ok) {
              return { graphId: graph.id, points: [] as SavedGraphSeriesPoint[] }
            }

            const payload = (await response.json()) as CohortDataResponse
            const selectedSet = new Set(periodStarts.map((value) => value.slice(0, 10)))
            const retailerMap = new Map(
              data
                .filter((row) => selectedSet.has(row.periodStart.slice(0, 10)))
                .map((row) => [row.periodStart.slice(0, 10), getRetailerMetricValue(row, graph.metric)])
            )
            const medianMap = new Map(payload.series.cohort_median.map((point) => [point.period_start.slice(0, 10), point.value]))
            const p25Map = new Map(payload.series.cohort_p25.map((point) => [point.period_start.slice(0, 10), point.value]))
            const p75Map = new Map(payload.series.cohort_p75.map((point) => [point.period_start.slice(0, 10), point.value]))

            const points: SavedGraphSeriesPoint[] = periodStarts.map((periodStart, index) => {
              const parsed = toUtcDate(periodStart)
              const includeYear = index === 0 || parsed.getUTCMonth() === 0
              return {
                periodKey: periodStart,
                label: graph.view_type === 'monthly'
                  ? formatMonthLabel(periodStart, includeYear)
                  : formatWeekLabel(periodStart, includeYear),
                retailer: retailerMap.get(periodStart.slice(0, 10)) ?? null,
                cohortMedian: medianMap.get(periodStart.slice(0, 10)) ?? null,
                cohortP25: p25Map.get(periodStart.slice(0, 10)) ?? null,
                cohortP75: p75Map.get(periodStart.slice(0, 10)) ?? null,
              }
            })

            return { graphId: graph.id, points }
          })
        )

        const next: Record<number, SavedGraphSeriesPoint[]> = {}
        for (const result of results) {
          next[result.graphId] = result.points
        }
        setSavedGraphSeriesById(next)
      } catch {
        setSavedGraphSeriesById({})
      }
    }

    run()
  }, [buildGraphPeriods, data, endpoint, savedGraphs])

  const resetGraphDraft = useCallback(() => {
    const fallbackView: 'monthly' | 'weekly' = overviewView === 'monthly' ? 'monthly' : 'weekly'
    const options = fallbackView === 'monthly' ? monthlyPeriodOptions : weeklyPeriodOptions
    setEditingGraphId(null)
    setGraphDraft({
      name: '',
      metric: metric,
      view_type: fallbackView,
      period_start: options[0] ?? '',
      period_end: options[options.length - 1] ?? '',
      include_provisional: includeProvisional,
      match_mode: cohortMatchMode,
      filters: Object.fromEntries(
        STYLE_G_ROW_CONFIG
          .map((row) => [row.domainKey, benchmarkDomainSelections[row.domainKey] ?? []])
          .filter(([, values]) => values.length > 0)
      ),
    })
    setSavedGraphMenusOpen({})
  }, [benchmarkDomainSelections, cohortMatchMode, includeProvisional, metric, monthlyPeriodOptions, overviewView, weeklyPeriodOptions])

  const saveGraphDraft = useCallback(async () => {
    if (!graphDraft.name.trim()) {
      setSavedGraphsError('Graph name is required')
      return
    }
    if (!graphDraft.period_start || !graphDraft.period_end) {
      setSavedGraphsError('Select graph start and end periods')
      return
    }
    if (graphDraft.period_start > graphDraft.period_end) {
      setSavedGraphsError('Start period must be before end period')
      return
    }

    try {
      setSavingGraph(true)
      setSavedGraphsError(null)

      const method = editingGraphId ? 'PUT' : 'POST'
      const target = editingGraphId ? `${graphsEndpoint}/${editingGraphId}` : graphsEndpoint
      const response = await fetch(target, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphDraft),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to save graph')
      }

      const graph = (await response.json()) as SavedMarketComparisonGraph
      setSavedGraphs((current) => {
        if (editingGraphId) {
          return current
            .map((item) => (item.id === editingGraphId ? graph : item))
            .sort((a, b) => a.position - b.position)
        }
        return [...current, graph].sort((a, b) => a.position - b.position)
      })
      resetGraphDraft()
    } catch (error) {
      setSavedGraphsError(error instanceof Error ? error.message : 'Failed to save graph')
    } finally {
      setSavingGraph(false)
    }
  }, [editingGraphId, graphDraft, graphsEndpoint, resetGraphDraft])

  const editGraph = useCallback((graph: SavedMarketComparisonGraph) => {
    setEditingGraphId(graph.id)
    setGraphDraft({
      name: graph.name,
      metric: graph.metric,
      view_type: graph.view_type,
      period_start: graph.period_start.slice(0, 10),
      period_end: graph.period_end.slice(0, 10),
      include_provisional: graph.include_provisional,
      match_mode: graph.match_mode,
      filters: graph.filters ?? {},
    })
  }, [])

  const deleteGraph = useCallback(async (graphId: number) => {
    try {
      setSavedGraphsError(null)
      const response = await fetch(`${graphsEndpoint}/${graphId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to delete graph')
      }
      setSavedGraphs((current) => current.filter((graph) => graph.id !== graphId))
      setSavedGraphSeriesById((current) => {
        const next = { ...current }
        delete next[graphId]
        return next
      })
      if (editingGraphId === graphId) {
        resetGraphDraft()
      }
    } catch (error) {
      setSavedGraphsError(error instanceof Error ? error.message : 'Failed to delete graph')
    }
  }, [editingGraphId, graphsEndpoint, resetGraphDraft])

  const copyGraph = useCallback(async (graphId: number) => {
    try {
      setSavedGraphsError(null)
      const response = await fetch(`${graphsEndpoint}/${graphId}/copy`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to copy graph')
      }
      const graph = (await response.json()) as SavedMarketComparisonGraph
      setSavedGraphs((current) => [...current, graph].sort((a, b) => a.position - b.position))
    } catch (error) {
      setSavedGraphsError(error instanceof Error ? error.message : 'Failed to copy graph')
    }
  }, [graphsEndpoint])

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Saved custom graphs</h3>
          {savedGraphsLoading && <span className="text-xs text-slate-500">Loading…</span>}
        </div>

        {savedGraphs.length === 0 && !savedGraphsLoading && (
          <p className="text-sm text-slate-500">No saved graphs yet.</p>
        )}

        <div className="space-y-3">
          {savedGraphs.map((graph) => {
            const series = savedGraphSeriesById[graph.id] ?? []
            const hasSeriesData = series.some((point) => point.cohortMedian !== null || point.retailer !== null)
            return (
              <div key={`saved-graph-${graph.id}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">{graph.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      {METRIC_OPTIONS.find((option) => option.key === graph.metric)?.label} • {graph.view_type} • {graph.period_start.slice(0, 10)} to {graph.period_end.slice(0, 10)}
                    </p>
                  </div>
                  {isAdminView && !reportId && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => editGraph(graph)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => copyGraph(graph.id)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGraph(graph.id)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {hasSeriesData ? (
                  <div className="mt-3">
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          stroke="#9CA3AF"
                          tickFormatter={(value) => {
                            if (graph.metric === 'gmv' || graph.metric === 'profit') return formatCurrency(Number(value))
                            if (toPercentMetric(graph.metric)) return `${Number(value).toFixed(1)}%`
                            return formatNumber(Number(value))
                          }}
                        />
                        <Tooltip
                          formatter={(value) => {
                            if (value === null || value === undefined) {
                              return formatMetricValue(graph.metric, null)
                            }
                            return formatMetricValue(graph.metric, Number(value))
                          }}
                          contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
                        />
                        <Area type="monotone" dataKey="cohortP75" name="Cohort P75" stroke="none" fill="#CBD5E1" fillOpacity={0.6} />
                        <Area type="monotone" dataKey="cohortP25" name="Cohort P25" stroke="none" fill="#FFFFFF" fillOpacity={1} />
                        <Line type="monotone" dataKey="retailer" name="This retailer" stroke={COLORS.warning} strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="cohortMedian" name="Cohort median" stroke={COLORS.success} strokeWidth={2} dot={false} strokeDasharray="6 3" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">No data for the selected graph window.</p>
                )}
              </div>
            )
          })}
        </div>

        {savedGraphsError && <p className="text-sm text-red-600">{savedGraphsError}</p>}
      </div>

      {isAdminView && !reportId && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Graph designer</h3>
            {editingGraphId && (
              <button
                type="button"
                onClick={resetGraphDraft}
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-7">
            <input
              type="text"
              value={graphDraft.name}
              onChange={(event) => setGraphDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Graph name"
              className="rounded-md border border-gray-300 px-2 py-2 text-xs"
            />
            <select
              value={graphDraft.metric}
              onChange={(event) => setGraphDraft((current) => ({ ...current, metric: event.target.value as MetricKey }))}
              className="rounded-md border border-gray-300 px-2 py-2 text-xs"
            >
              {METRIC_OPTIONS.map((option) => (
                <option key={`graph-metric-${option.key}`} value={option.key}>{option.label}</option>
              ))}
            </select>
            <select
              value={graphDraft.view_type}
              onChange={(event) => {
                const viewType = event.target.value as 'monthly' | 'weekly'
                const options = viewType === 'monthly' ? monthlyPeriodOptions : weeklyPeriodOptions
                setGraphDraft((current) => ({
                  ...current,
                  view_type: viewType,
                  period_start: options[0] ?? '',
                  period_end: options[options.length - 1] ?? '',
                }))
              }}
              className="rounded-md border border-gray-300 px-2 py-2 text-xs"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
            <select
              value={graphDraft.period_start}
              onChange={(event) => setGraphDraft((current) => ({ ...current, period_start: event.target.value }))}
              className="rounded-md border border-gray-300 px-2 py-2 text-xs"
            >
              {graphPeriodOptions.map((option) => (
                <option key={`graph-start-${option}`} value={option}>{option}</option>
              ))}
            </select>
            <select
              value={graphDraft.period_end}
              onChange={(event) => setGraphDraft((current) => ({ ...current, period_end: event.target.value }))}
              className="rounded-md border border-gray-300 px-2 py-2 text-xs"
            >
              {graphPeriodOptions.map((option) => (
                <option key={`graph-end-${option}`} value={option}>{option}</option>
              ))}
            </select>
            <select
              value={graphDraft.match_mode}
              onChange={(event) => setGraphDraft((current) => ({ ...current, match_mode: event.target.value as CohortMatchMode }))}
              className="rounded-md border border-gray-300 px-2 py-2 text-xs"
            >
              <option value="all">Match: ALL</option>
              <option value="any">Match: AT LEAST ONE</option>
            </select>
            <button
              type="button"
              onClick={saveGraphDraft}
              disabled={savingGraph}
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingGraph ? 'Saving…' : editingGraphId ? 'Update graph' : 'Save graph'}
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={graphDraft.include_provisional}
              onChange={(event) => setGraphDraft((current) => ({ ...current, include_provisional: event.target.checked }))}
            />
            Include provisional profile tags
          </label>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
            {STYLE_G_ROW_CONFIG.map((row) => {
              const domain = domains.find((item) => item.key === row.domainKey)
              const selectedValues = graphDraft.filters[row.domainKey] ?? []
              const menuKey = `graph-draft-${row.domainKey}`
              return (
                <div key={menuKey} className="relative">
                  <button
                    type="button"
                    onClick={() => setSavedGraphMenusOpen((current) => ({ ...current, [menuKey]: !current[menuKey] }))}
                    className="w-full rounded-md border border-gray-300 px-2 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <span className="font-medium">{row.rowLabel}</span>
                    <span className="ml-2 text-gray-500">{selectedValues.length > 0 ? selectedValues.join(', ') : 'Any'}</span>
                  </button>

                  {savedGraphMenusOpen[menuKey] && (
                    <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                      {(domain?.options ?? []).map((option) => {
                        const checked = selectedValues.includes(option.value)
                        return (
                          <label key={`${menuKey}-${option.value}`} className="flex items-center gap-2 py-1 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setGraphDraft((current) => ({
                                  ...current,
                                  filters: toggleFilterValue(current.filters, row.domainKey, option.value),
                                }))
                              }}
                            />
                            <span>{option.value}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Domain distribution strip</h3>
              <p className="text-sm text-slate-600 mt-1">X-axis is {METRIC_OPTIONS.find((option) => option.key === visualPreviewMetric)?.label}; fixed rows are domain types.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Cohort match logic</label>
                <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setCohortMatchMode('all')}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${cohortMatchMode === 'all' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    ALL
                  </button>
                  <button
                    type="button"
                    onClick={() => setCohortMatchMode('any')}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${cohortMatchMode === 'any' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    AT LEAST ONE
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Metric</label>
                <select
                  value={metric}
                  onChange={(event) => {
                    const nextMetric = event.target.value as MetricKey
                    setMetric(nextMetric)
                    setVisualPreviewMetric(nextMetric)
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-xs"
                >
                  {METRIC_OPTIONS.map((option) => (
                    <option key={`distribution-metric-${option.key}`} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={includeProvisional}
                  onChange={(event) => setIncludeProvisional(event.target.checked)}
                />
                Include provisional profile tags
              </label>
            </div>
          </div>

              <div className="space-y-3">
                {distributionRows.map((row, rowIndex) => {
                  const medianValue = row.aggregate?.cohortMedian ?? null
                  const toRelativePos = (value: number | null): number | null => {
                    if (value === null || medianValue === null) return null
                    const relative = ((value - medianValue) / distributionDeltaMax) * 46
                    return Math.max(2, Math.min(98, 50 + relative))
                  }

                  const p25 = toRelativePos(row.aggregate?.cohortP25 ?? null)
                  const p75 = toRelativePos(row.aggregate?.cohortP75 ?? null)
                  const median = 50
                  const you = toRelativePos(row.aggregate?.retailer ?? null)

                  return (
                    <div
                      key={`distribution-row-${row.rowKey}`}
                      className={`space-y-2 pb-2 ${rowIndex < distributionRows.length - 1 ? 'border-b border-slate-100' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                      <div className="w-56 shrink-0 space-y-1">
                        <div className="text-base font-semibold text-slate-800 text-right pr-1">{row.rowLabel}</div>
                        <div className="flex items-start gap-2">
                          <div className="min-h-7 flex-1 px-0 py-0 text-sm text-slate-700">
                            {row.selectedValues.length > 0 ? (
                              <div className="flex flex-wrap justify-end gap-1">
                                {row.selectedValues.map((value) => (
                                  (() => {
                                    const allocated = (retailerAllocatedByDomain[row.domainKey] ?? []).includes(value)
                                    return (
                                  <span
                                    key={`selected-pill-${row.rowKey}-${value}`}
                                    className={`inline-flex items-center justify-center text-center rounded-full px-2 py-0.5 text-xs ${allocated
                                      ? 'border border-amber-300 bg-amber-50 text-amber-900'
                                      : 'border border-slate-300 bg-white text-slate-700'
                                      }`}
                                  >
                                    {value}
                                  </span>
                                    )
                                  })()
                                ))}
                              </div>
                            ) : (
                              'No values selected'
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setDistributionMenusOpen((current) => ({
                              ...current,
                              [row.rowKey]: !current[row.rowKey],
                            }))}
                            className="h-7 w-7 rounded border border-gray-300 bg-white text-base leading-none text-gray-700 hover:bg-gray-50"
                            aria-label={distributionMenusOpen[row.rowKey] ? `Hide ${row.rowLabel} options` : `Show ${row.rowLabel} options`}
                          >
                            <ListFilterPlus className="mx-auto h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDistributionTrendsOpen((current) => ({
                              ...current,
                              [row.rowKey]: !current[row.rowKey],
                            }))}
                            className={`h-7 w-7 rounded border text-base leading-none transition-colors ${distributionTrendsOpen[row.rowKey]
                              ? 'border-slate-800 bg-slate-800 text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            aria-label={distributionTrendsOpen[row.rowKey] ? `Hide ${row.rowLabel} trend` : `Show ${row.rowLabel} trend`}
                          >
                            <ChartSpline className="mx-auto h-4 w-4" />
                          </button>
                        </div>
                        {distributionMenusOpen[row.rowKey] && (
                          <div className="relative">
                            <div className="absolute left-0 z-10 mt-1 max-h-56 w-72 overflow-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                            <div className="space-y-1">
                              {row.options.length === 0 ? (
                                <p className="text-sm text-gray-500">No values yet</p>
                              ) : (
                                row.options.map((option) => {
                                  const selected = row.selectedValues.includes(option.value)
                                  const allocated = (retailerAllocatedByDomain[row.domainKey] ?? []).includes(option.value)
                                  const impactCount = benchmarkOptionImpactMap[row.domainKey]?.[option.value] ?? 0
                                  return (
                                    <label
                                      key={`distribution-row-option-${row.domainKey}-${option.value}`}
                                      className={`flex items-center justify-between gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50 ${allocated ? 'bg-amber-50' : ''}`}
                                    >
                                      <span className="inline-flex items-center gap-2 text-gray-700">
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={() => setBenchmarkDomainSelections((current) => toggleFilterValue(current, row.domainKey, option.value))}
                                        />
                                        {option.value}
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        {cohortMatchMode === 'any' ? `+${impactCount}` : impactCount}
                                      </span>
                                    </label>
                                  )
                                })
                              )}
                            </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="relative h-[60px] flex-1">
                        <div className="absolute inset-y-0 w-px bg-slate-100" style={{ left: '50%' }} />
                        {p25 !== null && p75 !== null && (
                          <div
                            className="absolute top-1/2 h-2 -translate-y-1/2 rounded bg-slate-300"
                            style={{ left: `${Math.min(p25, p75)}%`, width: `${Math.max(2, Math.abs(p75 - p25))}%` }}
                          />
                        )}
                        {p25 !== null && (
                          <div
                            className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-white shadow"
                            style={{ left: `${p25}%` }}
                            title={`25th percentile: ${formatMetricValue(visualPreviewMetric, row.aggregate?.cohortP25 ?? null)}`}
                          />
                        )}
                        {p75 !== null && (
                          <div
                            className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-white shadow"
                            style={{ left: `${p75}%` }}
                            title={`75th percentile: ${formatMetricValue(visualPreviewMetric, row.aggregate?.cohortP75 ?? null)}`}
                          />
                        )}
                        {median !== null && (
                          <div
                            className="absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black shadow"
                            style={{ left: `${median}%`, backgroundColor: COLORS.success }}
                            title={`Median: ${formatMetricValue(visualPreviewMetric, row.aggregate?.cohortMedian ?? null)}`}
                          >
                            {rowIndex === 0 && (
                              <span className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.success }}>
                                Median
                              </span>
                            )}
                            <span className="absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.success }}>
                              {formatMetricValue(visualPreviewMetric, row.aggregate?.cohortMedian ?? null)}
                            </span>
                          </div>
                        )}
                        {you !== null && (
                          <div
                            className="absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black shadow"
                            style={{ left: `${you}%`, backgroundColor: COLORS.warning }}
                            title={`You: ${formatMetricValue(visualPreviewMetric, row.aggregate?.retailer ?? null)}`}
                          >
                            {rowIndex === 0 && (
                              <span className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.warningDark }}>
                                You
                              </span>
                            )}
                            <span className="absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.warningDark }}>
                              {formatMetricValue(visualPreviewMetric, row.aggregate?.retailer ?? null)}
                            </span>
                          </div>
                        )}
                      </div>
                      </div>
                      {distributionTrendsOpen[row.rowKey] && (
                        <div className="ml-56 pl-3">
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="mb-2 text-xs font-medium text-slate-600">{row.rowLabel} Cohort for {METRIC_OPTIONS.find((option) => option.key === visualPreviewMetric)?.label}</p>
                            <ResponsiveContainer width="100%" height={220}>
                              <ComposedChart data={distributionRowTrends[row.rowKey] ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                                <YAxis
                                  tick={{ fontSize: 11 }}
                                  stroke="#9CA3AF"
                                  tickFormatter={(value) => {
                                    if (visualPreviewMetric === 'gmv' || visualPreviewMetric === 'profit') return formatCurrency(Number(value))
                                    if (toPercentMetric(visualPreviewMetric)) return `${Number(value).toFixed(1)}%`
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
                                      return formatMetricValue(visualPreviewMetric, null)
                                    }
                                    const numeric = Number(value)
                                    return formatMetricValue(visualPreviewMetric, Number.isNaN(numeric) ? null : numeric)
                                  }}
                                  contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
                                />
                                <Area type="monotone" dataKey="cohortP75" name="Cohort P75" stroke="none" fill="#CBD5E1" fillOpacity={0.6} />
                                <Area type="monotone" dataKey="cohortP25" name="Cohort P25" stroke="none" fill="#FFFFFF" fillOpacity={1} />
                                <Line type="monotone" dataKey="retailer" name="This retailer" stroke={COLORS.warning} strokeWidth={2.5} dot={false} />
                                <Line type="monotone" dataKey="cohortMedian" name="Cohort median" stroke={COLORS.success} strokeWidth={2} dot={false} strokeDasharray="6 3" />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {distributionLoading && <p className="text-sm text-slate-500">Refreshing domain rows...</p>}
              {distributionError && <p className="text-sm text-red-600">{distributionError}</p>}
              {!distributionLoading && distributionRows.length === 0 && (
                <p className="text-sm text-slate-500">Select at least one value within the chosen domains to render rows.</p>
              )}

            </div>
        </div>
      </div>
  )
}
