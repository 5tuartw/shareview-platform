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
import { ChartSpline, Info, Users } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { COLORS } from '@/lib/colors'
import MetricToggleGroup from '@/components/client/charts/MetricToggleGroup'
import CohortBandTrendChart from '@/components/client/charts/CohortBandTrendChart'
import CohortDistributionStrip from '@/components/client/charts/CohortDistributionStrip'
import DistributionStripExplainer from '@/components/client/charts/DistributionStripExplainer'
import HiddenForRetailerBadge from '@/components/client/HiddenForRetailerBadge'

type MetricKey = 'gmv' | 'impressions' | 'clicks' | 'conversions' | 'ctr' | 'cvr'
type DistributionScaleMode = 'global-median-aligned' | 'true-distribution'
type DomainMatchMode = 'all' | 'any'
type DomainMatchModes = Record<string, DomainMatchMode>

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
  cohort_counts_by_period?: Array<{ period_start: string; count: number }>
  cohort_members_by_period?: Array<{
    period_start: string
    members: Array<{ retailer_id: string; retailer_name: string; metric_value?: number | null }>
  }>
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
  cohortMin: number | null
  cohortMax: number | null
}

type CohortMemberValue = {
  retailer_id: string
  retailer_name: string
  metric_value?: number | null
}

type OverviewChartPoint = {
  label: string
  periodStart: string
  gmv: number | null
  commission: number | null
  conversions: number | null
  cvr: number | null
  impressions: number | null
  clicks: number | null
  roi: number | null
  profit: number | null
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
  domain_match_modes?: DomainMatchModes
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
  domain_match_modes: DomainMatchModes
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

type SharedMarketComparisonGraph = SavedMarketComparisonGraph & {
  retailer_name: string
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
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cvr', label: 'CVR' },
]

const STYLE_G_ROW_CONFIG: Array<{ domainKey: string; rowLabel: string }> = [
  { domainKey: 'retailer_format', rowLabel: 'Format' },
  { domainKey: 'primary_category', rowLabel: 'Category' },
  { domainKey: 'other', rowLabel: 'Other' },
]

const CORE_PROFILE_ROW_CONFIG: Array<{ domainKey: string; rowLabel: string }> = [
  { domainKey: 'retailer_format', rowLabel: 'Format' },
  { domainKey: 'primary_category', rowLabel: 'Category' },
  { domainKey: 'target_audience', rowLabel: 'Audience' },
  { domainKey: 'price_positioning', rowLabel: 'Price tier' },
]

const GRAPH_FILTER_ROW_CONFIG: Array<{ domainKey: string; rowLabel: string }> = [
  { domainKey: 'retailer_format', rowLabel: 'Format' },
  { domainKey: 'primary_category', rowLabel: 'Category' },
  { domainKey: 'target_audience', rowLabel: 'Audience' },
  { domainKey: 'price_positioning', rowLabel: 'Price tier' },
  { domainKey: 'other', rowLabel: 'Other' },
]

const DOMAIN_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  GRAPH_FILTER_ROW_CONFIG.map((row) => [row.domainKey, row.rowLabel])
)

const DOMAIN_SELECTION_LIMITS: Partial<Record<string, number>> = {
}

const DOMAIN_FORCED_ANY_KEYS = new Set(['retailer_format', 'price_positioning'])
const OVERVIEW_SCALE_PARAM = 'overviewScale'

const getInitialOverviewScaleMode = (): DistributionScaleMode => {
  if (typeof window === 'undefined') return 'global-median-aligned'
  const value = new URLSearchParams(window.location.search).get(OVERVIEW_SCALE_PARAM)
  return value === 'true-distribution' ? 'true-distribution' : 'global-median-aligned'
}

const getSelectionPillClasses = (allocated: boolean, tone: 'strip' | 'menu' = 'strip'): string => {
  if (allocated) {
    return tone === 'menu'
      ? 'bg-amber-50 text-amber-800'
      : 'border border-amber-300 bg-amber-50 text-amber-900'
  }

  return tone === 'menu' ? 'bg-slate-50 text-slate-700' : 'border border-slate-300 bg-white text-slate-700'
}

const KNOWN_DOMAIN_KEYS = new Set(GRAPH_FILTER_ROW_CONFIG.map((row) => row.domainKey))

const normaliseKnownDomainFilters = (filters: Record<string, string[]>): Record<string, string[]> => {
  const next: Record<string, string[]> = {}
  for (const [domainKey, values] of Object.entries(filters ?? {})) {
    if (!KNOWN_DOMAIN_KEYS.has(domainKey)) continue
    const unique = Array.from(new Set((values ?? []).filter(Boolean)))
    if (unique.length > 0) {
      next[domainKey] = unique
    }
  }
  return next
}

const normaliseKnownDomainModes = (domainMatchModes: DomainMatchModes): DomainMatchModes => {
  const next: DomainMatchModes = {}
  for (const [domainKey, mode] of Object.entries(domainMatchModes ?? {})) {
    if (!KNOWN_DOMAIN_KEYS.has(domainKey)) continue
    next[domainKey] = DOMAIN_FORCED_ANY_KEYS.has(domainKey) ? 'any' : mode === 'all' ? 'all' : 'any'
  }
  return next
}

const getEffectiveDomainMatchMode = (
  domainKey: string,
  selectedValueCount: number,
  domainMatchModes: DomainMatchModes
): DomainMatchMode => {
  if (DOMAIN_FORCED_ANY_KEYS.has(domainKey)) return 'any'
  const maxSelections = DOMAIN_SELECTION_LIMITS[domainKey]
  if (maxSelections === 1 || selectedValueCount <= 1) return 'any'
  return domainMatchModes[domainKey] === 'all' ? 'all' : 'any'
}

const toPercentMetric = (metric: MetricKey) => metric === 'ctr' || metric === 'cvr'

const formatMetricValue = (metric: MetricKey, value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'No data'
  if (metric === 'gmv') return formatCurrency(value)
  if (metric === 'impressions' || metric === 'clicks' || metric === 'conversions') return formatNumber(Math.round(value))
  return `${value.toFixed(2)}%`
}

const getRetailerMetricValue = (row: OverviewChartPoint, metric: MetricKey): number | null => {
  switch (metric) {
    case 'gmv':
      return row.gmv
    case 'impressions':
      return row.impressions
    case 'clicks':
      return row.clicks
    case 'conversions':
      return row.conversions
    case 'ctr': {
      if (row.impressions === null || row.clicks === null || row.impressions <= 0) return null
      return (row.clicks / row.impressions) * 100
    }
    case 'cvr':
      return row.cvr
    default:
      return null
  }
}

const toggleFilterValue = (
  filters: Record<string, string[]>,
  domainKey: string,
  value: string,
  maxSelections?: number
): Record<string, string[]> => {
  if (maxSelections === 1) {
    const existing = filters[domainKey] ?? []
    // Single-select domains should still allow clearing back to "Any".
    if (existing.length === 1 && existing[0] === value) {
      const next = { ...filters }
      delete next[domainKey]
      return next
    }

    return {
      ...filters,
      [domainKey]: [value],
    }
  }

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

const countPeriodsBetween = (start: string, end: string, viewType: 'monthly' | 'weekly'): number => {
  if (!start || !end || start > end) return 0
  if (viewType === 'monthly') {
    const startDate = toUtcDate(`${start.slice(0, 7)}-01`)
    const endDate = toUtcDate(`${end.slice(0, 7)}-01`)
    const months = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
      + (endDate.getUTCMonth() - startDate.getUTCMonth())
    return months + 1
  }

  const msDiff = toUtcDate(end).getTime() - toUtcDate(start).getTime()
  return Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1
}

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

const normaliseSavedGraph = (graph: SavedMarketComparisonGraph): SavedMarketComparisonGraph => {
  const parsedId = Number.parseInt(String(graph.id), 10)
  return {
    ...graph,
    id: Number.isFinite(parsedId) ? parsedId : graph.id,
    filters: normaliseKnownDomainFilters(graph.filters ?? {}),
    domain_match_modes: normaliseKnownDomainModes(graph.domain_match_modes ?? {}),
  }
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
  const [benchmarkDomainMatchModes, setBenchmarkDomainMatchModes] = useState<DomainMatchModes>({})
  const [visualPreviewMetric, setVisualPreviewMetric] = useState<MetricKey>('gmv')
  const [distributionRowAggregates, setDistributionRowAggregates] = useState<Record<string, BenchmarkAggregate>>({})
  const [distributionRowTrends, setDistributionRowTrends] = useState<Record<string, DistributionTrendPoint[]>>({})
  const [distributionRowMembers, setDistributionRowMembers] = useState<Record<string, CohortMemberValue[]>>({})
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [distributionError, setDistributionError] = useState<string | null>(null)
  const [distributionTrendsOpen, setDistributionTrendsOpen] = useState<Record<string, boolean>>({})
  const [distributionMembersOpen, setDistributionMembersOpen] = useState<Record<string, boolean>>({})
  const [distributionScaleMode, setDistributionScaleMode] = useState<DistributionScaleMode>(() => getInitialOverviewScaleMode())
  const [includeProvisional, setIncludeProvisional] = useState(true)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [savedGraphs, setSavedGraphs] = useState<SavedMarketComparisonGraph[]>([])
  const [savedGraphsLoading, setSavedGraphsLoading] = useState(false)
  const [savedGraphsError, setSavedGraphsError] = useState<string | null>(null)
  const [savedGraphSeriesById, setSavedGraphSeriesById] = useState<Record<number, SavedGraphSeriesPoint[]>>({})
  const [savedGraphCohortCountsById, setSavedGraphCohortCountsById] = useState<Record<number, Array<{ period_start: string; count: number }>>>({})
  const [savedGraphCohortMembersById, setSavedGraphCohortMembersById] = useState<Record<number, Array<{ period_start: string; members: Array<{ retailer_id: string; retailer_name: string }> }>>>({})
  const [savedGraphMatchedCountById, setSavedGraphMatchedCountById] = useState<Record<number, number>>({})
  const [savedGraphMenusOpen, setSavedGraphMenusOpen] = useState<Record<string, boolean>>({})
  const [sharedGraphs, setSharedGraphs] = useState<SharedMarketComparisonGraph[]>([])
  const [sharedGraphsLoading, setSharedGraphsLoading] = useState(false)
  const [sharedGraphsError, setSharedGraphsError] = useState<string | null>(null)
  const [sharedGraphSearch, setSharedGraphSearch] = useState('')
  const [selectedSharedGraphId, setSelectedSharedGraphId] = useState<string>('')
  const [addGraphMode, setAddGraphMode] = useState<'create' | 'load'>('create')
  const [savingGraph, setSavingGraph] = useState(false)
  const [editingGraphId, setEditingGraphId] = useState<number | null>(null)

  const endpoint = `${apiBase ?? '/api'}/retailers/${retailerId}/overview/market-comparison`
  const graphsEndpoint = `${endpoint}/graphs`
  const sharedGraphsEndpoint = `${graphsEndpoint}/library`

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
    domain_match_modes: {},
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

  const selectedComparisonPeriodLabel = useMemo(() => {
    if (overviewView === 'monthly') {
      const selectedMonth = `${period.slice(0, 7)}-01`
      return formatMonthLabel(selectedMonth, true)
    }

    const fallbackWeek = data[data.length - 1]?.periodStart?.slice(0, 10)
    const selectedWeek = (weekPeriod || fallbackWeek || '').slice(0, 10)
    if (!selectedWeek) return ''
    return formatWeekLabel(selectedWeek, true)
  }, [data, overviewView, period, weekPeriod])

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
        const nextDomains = payload.domains ?? []
        const defaultFilters = payload.default_filters ?? {}
        setDomains(nextDomains)
        setRetailerAllocatedByDomain(defaultFilters)
        setBenchmarkDomainSelections(defaultFilters)
        setBenchmarkDomainMatchModes(
          Object.fromEntries(
            nextDomains.map((domain) => [
              domain.key,
              getEffectiveDomainMatchMode(domain.key, (defaultFilters[domain.key] ?? []).length, {}),
            ])
          )
        )
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
      const ordered = [...snapshotSavedGraphs]
        .map((graph) => normaliseSavedGraph(graph))
        .filter((graph) => graph.name.trim().length > 0)
        .sort((a, b) => a.position - b.position)
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
        setSavedGraphs(
          (payload ?? [])
            .filter((graph) => graph.is_active !== false)
            .map((graph) => normaliseSavedGraph(graph))
            .filter((graph) => graph.name.trim().length > 0)
        )
      } catch (graphError) {
        setSavedGraphsError(graphError instanceof Error ? graphError.message : 'Unable to load saved graphs')
      } finally {
        setSavedGraphsLoading(false)
      }
    }

    loadSavedGraphs()
  }, [graphsEndpoint, reportId, snapshotSavedGraphs])

  useEffect(() => {
    if (!isAdminView || !!reportId) return

    const timer = setTimeout(async () => {
      try {
        setSharedGraphsLoading(true)
        setSharedGraphsError(null)

        const search = sharedGraphSearch.trim()
        const response = await fetch(`${sharedGraphsEndpoint}?q=${encodeURIComponent(search)}&limit=80`, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Unable to load shared graph library')
        }

        const payload = (await response.json()) as SharedMarketComparisonGraph[]
        setSharedGraphs(
          (payload ?? []).map((graph) => ({
            ...graph,
            ...normaliseSavedGraph(graph),
          }))
        )
      } catch (error) {
        setSharedGraphsError(error instanceof Error ? error.message : 'Unable to load shared graph library')
      } finally {
        setSharedGraphsLoading(false)
      }
    }, 180)

    return () => clearTimeout(timer)
  }, [isAdminView, reportId, sharedGraphSearch, sharedGraphsEndpoint])

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

    return STYLE_G_ROW_CONFIG
      .filter((row) => {
        if (row.domainKey !== 'other') return true
        return (retailerAllocatedByDomain[row.domainKey] ?? []).length > 0
      })
      .map((row) => {
      const selectedValues = benchmarkDomainSelections[row.domainKey] ?? []
      return {
        rowKey: row.domainKey,
        domainKey: row.domainKey,
        rowLabel: row.rowLabel,
        selectedValues,
        domainMatchMode: getEffectiveDomainMatchMode(
          row.domainKey,
          selectedValues.length,
          benchmarkDomainMatchModes
        ),
        options: domainOptionsByKey.get(row.domainKey) ?? [],
        aggregate: distributionRowAggregates[row.domainKey] ?? null,
      }
    })
  }, [benchmarkDomainMatchModes, benchmarkDomainSelections, distributionRowAggregates, domains, retailerAllocatedByDomain])

  useEffect(() => {
    if (metadataLoading || selectedPeriodStarts.length === 0) {
      setDistributionRowAggregates({})
      setDistributionRowTrends({})
      setDistributionRowMembers({})
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
      setDistributionRowMembers({})
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
                match_mode: 'all',
                domain_match_modes: benchmarkDomainMatchModes,
                period_starts: selectedPeriodStarts,
                include_cohort_members: isAdminView,
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

            const latestPeriod = selectedPeriodStarts[selectedPeriodStarts.length - 1]
            const latestCohortMin = (payload.series.cohort_min ?? [])
              .find((row) => row.period_start.slice(0, 10) === latestPeriod)
              ?.value ?? null
            const latestCohortMax = (payload.series.cohort_max ?? [])
              .find((row) => row.period_start.slice(0, 10) === latestPeriod)
              ?.value ?? null

            return {
              rowKey,
              payload,
              aggregate: {
                retailer: averageNumbers(retailerValues),
                cohortMedian: averageNumbers(cohortMedianValues),
                cohortP25: averageNumbers(cohortP25Values),
                cohortP75: averageNumbers(cohortP75Values),
                cohortMin: latestCohortMin,
                cohortMax: latestCohortMax,
              } satisfies BenchmarkAggregate,
            }
          })
        )

        const next: Record<string, BenchmarkAggregate> = {}
        const nextTrends: Record<string, DistributionTrendPoint[]> = {}
        const nextMembers: Record<string, CohortMemberValue[]> = {}
        for (const item of responses) {
          next[item.rowKey] = item.aggregate

          const medianMap = new Map(item.payload.series.cohort_median.map((point) => [point.period_start.slice(0, 10), point.value]))
          const p25Map = new Map(item.payload.series.cohort_p25.map((point) => [point.period_start.slice(0, 10), point.value]))
          const p75Map = new Map(item.payload.series.cohort_p75.map((point) => [point.period_start.slice(0, 10), point.value]))
          const minMap = new Map((item.payload.series.cohort_min ?? []).map((point) => [point.period_start.slice(0, 10), point.value]))
          const maxMap = new Map((item.payload.series.cohort_max ?? []).map((point) => [point.period_start.slice(0, 10), point.value]))
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
              cohortMin: minMap.get(periodStart) ?? null,
              cohortMax: maxMap.get(periodStart) ?? null,
            }
          })

          const latestPeriod = selectedPeriodStarts[selectedPeriodStarts.length - 1]
          const matchedPeriodMembers = (item.payload.cohort_members_by_period ?? [])
            .find((entry) => entry.period_start.slice(0, 10) === latestPeriod)
            ?.members ?? []

          nextMembers[item.rowKey] = matchedPeriodMembers
            .slice()
            .sort((a, b) => {
              const aValue = a.metric_value ?? Number.NEGATIVE_INFINITY
              const bValue = b.metric_value ?? Number.NEGATIVE_INFINITY
              if (bValue !== aValue) return bValue - aValue
              return a.retailer_name.localeCompare(b.retailer_name)
            })
        }
        setDistributionRowAggregates(next)
        setDistributionRowTrends(nextTrends)
        setDistributionRowMembers(nextMembers)
      } catch (requestError) {
        setDistributionError(requestError instanceof Error ? requestError.message : 'Unable to load domain distribution rows')
      } finally {
        setDistributionLoading(false)
      }
    }

    run()
  }, [
    benchmarkDomainSelections,
    benchmarkDomainMatchModes,
    data,
    endpoint,
    includeProvisional,
    isAdminView,
    metadataLoading,
    overviewView,
    selectedPeriodStarts,
    visualPreviewMetric,
  ])

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

  const globalQuartileBounds = useMemo(() => {
    const p25Values = distributionRows
      .map((row) => row.aggregate?.cohortP25)
      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
    const p75Values = distributionRows
      .map((row) => row.aggregate?.cohortP75)
      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))

    if (p25Values.length === 0 || p75Values.length === 0) return null

    return {
      lowestP25: Math.min(...p25Values),
      highestP75: Math.max(...p75Values),
    }
  }, [distributionRows])

  const graphPeriodOptions = graphDraft.view_type === 'monthly' ? monthlyPeriodOptions : weeklyPeriodOptions

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    if (params.get(OVERVIEW_SCALE_PARAM) === distributionScaleMode) return

    params.set(OVERVIEW_SCALE_PARAM, distributionScaleMode)
    const nextQuery = params.toString()
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [distributionScaleMode])

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
      setSavedGraphCohortCountsById({})
      setSavedGraphCohortMembersById({})
      setSavedGraphMatchedCountById({})
      return
    }

    const run = async () => {
      try {
        const results = await Promise.all(
          savedGraphs.map(async (graph) => {
            const periodStarts = buildGraphPeriods(graph)
            if (periodStarts.length === 0) {
              return {
                graphId: graph.id,
                points: [] as SavedGraphSeriesPoint[],
                cohortCounts: [] as Array<{ period_start: string; count: number }>,
                cohortMembers: [] as Array<{ period_start: string; members: Array<{ retailer_id: string; retailer_name: string }> }>,
                matchedCount: 0,
              }
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
                domain_match_modes: graph.domain_match_modes ?? {},
                include_cohort_members: isAdminView,
                period_starts: periodStarts,
                filters: graph.filters,
              }),
            })

            if (!response.ok) {
              return {
                graphId: graph.id,
                points: [] as SavedGraphSeriesPoint[],
                cohortCounts: [] as Array<{ period_start: string; count: number }>,
                cohortMembers: [] as Array<{ period_start: string; members: Array<{ retailer_id: string; retailer_name: string }> }>,
                matchedCount: 0,
              }
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

            return {
              graphId: graph.id,
              points,
              cohortCounts: payload.cohort_counts_by_period ?? [],
              cohortMembers: payload.cohort_members_by_period ?? [],
              matchedCount: payload.cohort_summary.matched_count ?? 0,
            }
          })
        )

        const next: Record<number, SavedGraphSeriesPoint[]> = {}
        const nextCounts: Record<number, Array<{ period_start: string; count: number }>> = {}
        const nextMembers: Record<number, Array<{ period_start: string; members: Array<{ retailer_id: string; retailer_name: string }> }>> = {}
        const nextMatchedCounts: Record<number, number> = {}
        for (const result of results) {
          next[result.graphId] = result.points
          nextCounts[result.graphId] = result.cohortCounts
          nextMembers[result.graphId] = result.cohortMembers
          nextMatchedCounts[result.graphId] = result.matchedCount
        }
        setSavedGraphSeriesById(next)
        setSavedGraphCohortCountsById(nextCounts)
        setSavedGraphCohortMembersById(nextMembers)
        setSavedGraphMatchedCountById(nextMatchedCounts)
      } catch {
        setSavedGraphSeriesById({})
        setSavedGraphCohortCountsById({})
        setSavedGraphCohortMembersById({})
        setSavedGraphMatchedCountById({})
      }
    }

    run()
  }, [buildGraphPeriods, data, endpoint, isAdminView, savedGraphs])

  const resetGraphDraft = useCallback(() => {
    const fallbackView: 'monthly' | 'weekly' = overviewView === 'monthly' ? 'monthly' : 'weekly'
    const options = fallbackView === 'monthly' ? monthlyPeriodOptions : weeklyPeriodOptions
    setEditingGraphId(null)
    setAddGraphMode('create')
    setSelectedSharedGraphId('')
    setGraphDraft({
      name: '',
      metric: metric,
      view_type: fallbackView,
      period_start: options[0] ?? '',
      period_end: options[options.length - 1] ?? '',
      include_provisional: includeProvisional,
      match_mode: 'all',
      domain_match_modes: benchmarkDomainMatchModes,
      filters: Object.fromEntries(
        GRAPH_FILTER_ROW_CONFIG
          .map((row) => [row.domainKey, benchmarkDomainSelections[row.domainKey] ?? []])
          .filter(([, values]) => values.length > 0)
      ),
    })
    setSavedGraphMenusOpen({})
  }, [benchmarkDomainMatchModes, benchmarkDomainSelections, includeProvisional, metric, monthlyPeriodOptions, overviewView, weeklyPeriodOptions])

  const buildCompatibleDraftFromSharedGraph = useCallback((graph: SharedMarketComparisonGraph): SavedGraphDraft => {
    const mergedFilters: Record<string, string[]> = {
      ...normaliseKnownDomainFilters(graph.filters ?? {}),
    }

    for (const row of GRAPH_FILTER_ROW_CONFIG) {
      const assignedValues = retailerAllocatedByDomain[row.domainKey] ?? []
      if (assignedValues.length === 0) continue

      const merged = new Set(mergedFilters[row.domainKey] ?? [])
      for (const value of assignedValues) {
        if (value && value.trim().length > 0) {
          merged.add(value)
        }
      }

      if (merged.size > 0) {
        mergedFilters[row.domainKey] = Array.from(merged)
      }
    }

    const mergedDomainModes = normaliseKnownDomainModes(graph.domain_match_modes ?? {})
    for (const [domainKey, values] of Object.entries(mergedFilters)) {
      mergedDomainModes[domainKey] = getEffectiveDomainMatchMode(domainKey, values.length, mergedDomainModes)
    }

    return {
      name: graph.name,
      metric: graph.metric,
      view_type: graph.view_type,
      period_start: graph.period_start.slice(0, 10),
      period_end: graph.period_end.slice(0, 10),
      include_provisional: graph.include_provisional,
      match_mode: 'all',
      domain_match_modes: mergedDomainModes,
      filters: mergedFilters,
    }
  }, [retailerAllocatedByDomain])

  const loadSharedGraphIntoDraft = useCallback((graphId?: string) => {
    const targetGraphId = (graphId ?? selectedSharedGraphId).trim()
    if (!targetGraphId) {
      setSavedGraphsError('Choose a shared graph to load')
      return
    }

    const selectedGraph = sharedGraphs.find((graph) => String(graph.id) === targetGraphId)
    if (!selectedGraph) {
      setSavedGraphsError('Selected shared graph was not found')
      return
    }
    setSavedGraphsError(null)
    setEditingGraphId(null)

    const draft = buildCompatibleDraftFromSharedGraph(selectedGraph)
    setGraphDraft({
      name: draft.name,
      metric: draft.metric,
      view_type: draft.view_type,
      period_start: draft.period_start,
      period_end: draft.period_end,
      include_provisional: draft.include_provisional,
      match_mode: 'all',
      domain_match_modes: normaliseKnownDomainModes(draft.domain_match_modes ?? {}),
      filters: normaliseKnownDomainFilters(draft.filters ?? {}),
    })
  }, [buildCompatibleDraftFromSharedGraph, selectedSharedGraphId, sharedGraphs])

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
      const payload: SavedGraphDraft = {
        ...graphDraft,
        match_mode: 'all',
      }

      const response = await fetch(target, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to save graph')
      }

      const graph = (await response.json()) as SavedMarketComparisonGraph
      const normalisedGraph = normaliseSavedGraph(graph)
      setSavedGraphs((current) => {
        if (editingGraphId) {
          return current
            .map((item) => (String(item.id) === String(editingGraphId) ? normalisedGraph : item))
            .sort((a, b) => a.position - b.position)
        }
        return [...current, normalisedGraph].sort((a, b) => a.position - b.position)
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
      match_mode: 'all',
      domain_match_modes: normaliseKnownDomainModes(graph.domain_match_modes ?? {}),
      filters: normaliseKnownDomainFilters(graph.filters ?? {}),
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
      setSavedGraphs((current) => current.filter((graph) => String(graph.id) !== String(graphId)))
      setSavedGraphSeriesById((current) => {
        const next = { ...current }
        delete next[graphId]
        return next
      })
      setSavedGraphCohortCountsById((current) => {
        const next = { ...current }
        delete next[graphId]
        return next
      })
      setSavedGraphCohortMembersById((current) => {
        const next = { ...current }
        delete next[graphId]
        return next
      })
      setSavedGraphMatchedCountById((current) => {
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
      const normalisedGraph = normaliseSavedGraph(graph)
      setSavedGraphs((current) => [...current, normalisedGraph].sort((a, b) => a.position - b.position))
    } catch (error) {
      setSavedGraphsError(error instanceof Error ? error.message : 'Failed to copy graph')
    }
  }, [graphsEndpoint])

  const renderStatusMessage = (
    message: string,
    tone: 'neutral' | 'error' | 'loading' = 'neutral',
    compact = false
  ) => {
    const toneClasses = tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'loading'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-50 text-slate-600'

    return (
      <div className={`rounded-md border px-3 ${compact ? 'py-2 text-xs' : 'py-2.5 text-sm'} ${toneClasses}`}>
        {message}
      </div>
    )
  }

  const renderGraphDraftSettings = (submitLabel: string, showCancel = false) => (
    <>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
        <input
          type="text"
          value={graphDraft.name}
          onChange={(event) => setGraphDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="Graph name"
          className="rounded-md border border-gray-300 px-2 py-2 text-xs"
        />
        <div className="rounded-md border border-gray-300 px-2 py-2 text-xs text-gray-700">
          <span className="mr-2 font-medium text-gray-600">Metric</span>
          <MetricToggleGroup
            options={METRIC_OPTIONS}
            selected={graphDraft.metric}
            onSelect={(nextMetric) => setGraphDraft((current) => ({ ...current, metric: nextMetric }))}
          />
        </div>
        <div className="rounded-md border border-gray-300 px-2 py-2 text-xs text-gray-700 lg:col-span-2">
          <span className="mr-3 font-medium text-gray-600">Grain</span>
          <label className="mr-4 inline-flex items-center gap-1.5">
            <input
              type="radio"
              checked={graphDraft.view_type === 'weekly'}
              onChange={() => {
                const options = weeklyPeriodOptions
                setGraphDraft((current) => ({
                  ...current,
                  view_type: 'weekly',
                  period_start: options[0] ?? '',
                  period_end: options[options.length - 1] ?? '',
                }))
              }}
            />
            Weekly
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              checked={graphDraft.view_type === 'monthly'}
              onChange={() => {
                const options = monthlyPeriodOptions
                setGraphDraft((current) => ({
                  ...current,
                  view_type: 'monthly',
                  period_start: options[0] ?? '',
                  period_end: options[options.length - 1] ?? '',
                }))
              }}
            />
            Monthly
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <span className="w-9 font-medium text-gray-600">From:</span>
          <select
            value={graphDraft.period_start}
            onChange={(event) => setGraphDraft((current) => ({ ...current, period_start: event.target.value, match_mode: 'all' }))}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-2 text-xs"
          >
            {graphPeriodOptions.map((option) => (
              <option key={`graph-start-${option}`} value={option}>{option}</option>
            ))}
          </select>
          <span className="whitespace-nowrap text-[11px] text-slate-500">
            {(() => {
              const count = countPeriodsBetween(graphDraft.period_start, graphDraft.period_end, graphDraft.view_type)
              if (count <= 0) return ''
              return `${count} ${graphDraft.view_type === 'monthly' ? (count === 1 ? 'month' : 'months') : (count === 1 ? 'week' : 'weeks')}`
            })()}
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <span className="w-9 font-medium text-gray-600">To:</span>
          <select
            value={graphDraft.period_end}
            onChange={(event) => setGraphDraft((current) => ({ ...current, period_end: event.target.value, match_mode: 'all' }))}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-2 text-xs"
          >
            {graphPeriodOptions.map((option) => (
              <option key={`graph-end-${option}`} value={option}>{option}</option>
            ))}
          </select>
          <span className="whitespace-nowrap text-[11px] text-slate-500">
            {(() => {
              const count = countPeriodsBetween(graphDraft.period_start, graphDraft.period_end, graphDraft.view_type)
              if (count <= 0) return ''
              return `${count} ${graphDraft.view_type === 'monthly' ? (count === 1 ? 'month' : 'months') : (count === 1 ? 'week' : 'weeks')}`
            })()}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
        <div className="lg:col-span-5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setGraphDraft((current) => ({
              ...current,
              filters: {},
              domain_match_modes: {},
            }))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Clear all domain selections
          </button>
        </div>
        {GRAPH_FILTER_ROW_CONFIG.map((row) => {
          const domain = domains.find((item) => item.key === row.domainKey)
          const selectedValues = graphDraft.filters[row.domainKey] ?? []
          const maxSelections = DOMAIN_SELECTION_LIMITS[row.domainKey]
          const effectiveMode = getEffectiveDomainMatchMode(
            row.domainKey,
            selectedValues.length,
            graphDraft.domain_match_modes
          )
          const menuKey = `graph-draft-${row.domainKey}`
          return (
            <div key={menuKey} className="relative">
              <button
                type="button"
                onClick={() => setSavedGraphMenusOpen((current) => ({ ...current, [menuKey]: !current[menuKey] }))}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <Info className="h-3.5 w-3.5" />
                  {row.rowLabel} filters
                </span>
                <span className="mt-1 block text-xs text-slate-700">
                  {selectedValues.length > 0 ? selectedValues.join(', ') : 'All advertisers'}
                </span>
              </button>

              {savedGraphMenusOpen[menuKey] && (
                <div className="absolute left-0 z-10 mt-1 max-h-56 w-72 overflow-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                  {!DOMAIN_FORCED_ANY_KEYS.has(row.domainKey) && (
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                      <span className="text-[11px] font-medium text-gray-500">When multiple values are selected</span>
                      <select
                        value={effectiveMode}
                        disabled={selectedValues.length <= 1}
                        onChange={(event) => {
                          const nextMode = event.target.value as DomainMatchMode
                          setGraphDraft((current) => ({
                            ...current,
                            domain_match_modes: {
                              ...current.domain_match_modes,
                              [row.domainKey]: nextMode,
                            },
                          }))
                        }}
                        className="rounded border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="any">Match any selected value (OR)</option>
                        <option value="all">Match all selected values (AND)</option>
                      </select>
                    </div>
                  )}
                  <div className="space-y-1">
                    {(domain?.options ?? []).map((option) => {
                      const checked = selectedValues.includes(option.value)
                      const allocated = (retailerAllocatedByDomain[row.domainKey] ?? []).includes(option.value)
                      const maxReached = maxSelections !== undefined && selectedValues.length >= maxSelections
                      const disabled = !checked && maxReached
                      return (
                        <label
                          key={`${menuKey}-${option.value}`}
                          className={`flex items-center justify-between gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50 ${allocated ? 'bg-amber-50' : ''}`}
                        >
                          <span className="inline-flex items-center gap-2 text-gray-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => {
                                setGraphDraft((current) => ({
                                  ...current,
                                  filters: toggleFilterValue(current.filters, row.domainKey, option.value, maxSelections),
                                }))
                              }}
                            />
                            {checked || allocated ? (
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${getSelectionPillClasses(allocated, 'menu')}`}>
                                {option.value}{allocated ? ' (You)' : ''}
                              </span>
                            ) : (
                              <span>{option.value}</span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        {showCancel && (
          <button
            type="button"
            onClick={resetGraphDraft}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={saveGraphDraft}
          disabled={savingGraph}
          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingGraph ? 'Saving…' : submitLabel}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      <HiddenForRetailerBadge label={"In development \u2014 will not appear in Snapshot Reports"} />

      <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-sm">
        <p className="text-base leading-7 text-slate-800">
          Compare yourself to similar retailers and advertisers that work with SHAREIGHT. We have matched you with other retailers that share your commercial format and have overlapping product categories.
        </p>
        <p className="mt-2 text-base font-semibold text-slate-900">Your profile is:</p>
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {CORE_PROFILE_ROW_CONFIG.map((row) => {
            const assignedValues = retailerAllocatedByDomain[row.domainKey] ?? []
            return (
              <div key={`core-profile-${row.domainKey}`} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{row.rowLabel}</p>
                {assignedValues.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {assignedValues.map((value) => (
                      <span
                        key={`core-profile-pill-${row.domainKey}-${value}`}
                        className={`inline-flex max-w-[220px] items-center justify-center truncate text-center rounded-md px-3 py-0.5 text-xs ${getSelectionPillClasses(true, 'strip')}`}
                        title={value}
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Not assigned</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="order-2 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Trend Graphs</h3>
          {savedGraphsLoading && <span className="text-xs text-slate-500">Loading…</span>}
        </div>

        {savedGraphs.length === 0 && !savedGraphsLoading && (
          renderStatusMessage('No saved graphs yet.')
        )}

        <div className="space-y-3">
          {savedGraphs.map((graph) => {
            const series = savedGraphSeriesById[graph.id] ?? []
            const cohortCounts = savedGraphCohortCountsById[graph.id] ?? []
            const cohortMembersByPeriod = savedGraphCohortMembersById[graph.id] ?? []
            const matchedCount = savedGraphMatchedCountById[graph.id] ?? 0
            const countValues = cohortCounts.map((entry) => entry.count)
            const cohortSizeLabel = (() => {
              if (countValues.length > 0) {
                const minCount = Math.min(...countValues)
                const maxCount = Math.max(...countValues)
                return minCount === maxCount ? `${minCount}` : `${minCount}-${maxCount}`
              }
              return String(matchedCount)
            })()
            const cohortMembersMap = new Map(
              cohortMembersByPeriod.map((entry) => [entry.period_start.slice(0, 10), entry.members])
            )
            const hasSeriesData = series.some((point) => point.cohortMedian !== null || point.retailer !== null)
            const hasQuartileValues = series.some((point) => point.cohortP25 !== null && point.cohortP75 !== null)
            const hasDistinctQuartileBand = series.some(
              (point) => point.cohortP25 !== null && point.cohortP75 !== null && point.cohortP25 !== point.cohortP75
            )
            return (
              <div key={`saved-graph-${graph.id}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">{graph.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      {METRIC_OPTIONS.find((option) => option.key === graph.metric)?.label} • {graph.view_type} • {graph.period_start.slice(0, 10)} to {graph.period_end.slice(0, 10)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Cohort Size: <span className="text-slate-900 font-medium">{cohortSizeLabel}</span></p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(() => {
                        const filters = graph.filters ?? {}
                        const entries = Object.entries(filters)
                          .map(([domainKey, values]) => [domainKey, (values ?? []).filter(Boolean)] as const)
                          .filter(([, values]) => values.length > 0)

                        if (entries.length === 0) {
                          return 'Compared to all advertisers'
                        }

                        return entries.map(([domainKey, values], index) => {
                          const operator = getEffectiveDomainMatchMode(domainKey, values.length, graph.domain_match_modes ?? {}) === 'all' ? ' and ' : ' or '
                          return (
                            <span key={`graph-domain-summary-${graph.id}-${domainKey}`}>
                              <span className="text-slate-500">{DOMAIN_LABEL_BY_KEY[domainKey] ?? domainKey}: </span>
                              <span className="text-slate-900">{values.join(operator)}</span>
                              {index < entries.length - 1 ? <span className="text-slate-400">  *  </span> : null}
                            </span>
                          )
                        })
                      })()}
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
                            if (graph.metric === 'gmv') return formatCurrency(Number(value))
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
                        <Area type="monotone" dataKey="cohortP75" name="Cohort P75" stroke="none" fill="#CBD5E1" fillOpacity={0.6} connectNulls />
                        <Area type="monotone" dataKey="cohortP25" name="Cohort P25" stroke="none" fill="#FFFFFF" fillOpacity={1} connectNulls />
                        <Line type="monotone" dataKey="cohortP25" name="Cohort P25 (line)" stroke="#94A3B8" strokeWidth={1} dot={false} strokeDasharray="2 4" connectNulls />
                        <Line type="monotone" dataKey="cohortP75" name="Cohort P75 (line)" stroke="#94A3B8" strokeWidth={1} dot={false} strokeDasharray="2 4" connectNulls />
                        <Line type="monotone" dataKey="retailer" name="You" stroke={COLORS.warning} strokeWidth={2.5} dot={false} connectNulls />
                        <Line type="monotone" dataKey="cohortMedian" name="Cohort median" stroke={COLORS.success} strokeWidth={2} dot={false} strokeDasharray="6 3" connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                    {!hasQuartileValues && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Cohort range unavailable for one or more months because the matched cohort has insufficient monthly data.
                      </p>
                    )}
                    {hasQuartileValues && !hasDistinctQuartileBand && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Cohort P25 and P75 are identical for this selection, so the band collapses to a line.
                      </p>
                    )}
                    {isAdminView && cohortMembersByPeriod.length > 0 && (
                      <div className="mt-3 overflow-x-auto rounded border border-slate-200">
                        <div className="grid min-w-[560px] gap-0.5 bg-slate-100" style={{ gridTemplateColumns: `repeat(${series.length || 1}, minmax(110px, 1fr))` }}>
                          {series.map((point) => {
                            const members = cohortMembersMap.get(point.periodKey.slice(0, 10)) ?? []
                            return (
                              <div key={`cohort-members-${graph.id}-${point.periodKey}`} className="bg-white p-2 align-top">
                                <p className="text-[10px] font-semibold text-slate-600">{point.label}</p>
                                <p className="mt-1 text-[10px] text-slate-500">{members.length} retailers</p>
                                <p className="mt-1 text-[10px] leading-4 text-slate-700">
                                  {members.length > 0
                                    ? members.map((member) => member.retailer_name).join(', ')
                                    : 'None'}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    {renderStatusMessage('No data for the selected graph window.', 'neutral', true)}
                  </div>
                )}

                {isAdminView && !reportId && editingGraphId === graph.id && (
                  <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Edit graph</p>
                    {renderGraphDraftSettings('Update graph', true)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {savedGraphsError && renderStatusMessage(savedGraphsError, 'error', true)}
      </div>

      {isAdminView && !reportId && (
        <div className="order-3 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Add graph</h3>
            <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setAddGraphMode('create')}
                className={`rounded px-2.5 py-1 text-xs font-medium ${addGraphMode === 'create' ? 'border border-amber-300 bg-amber-100 text-amber-900' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => setAddGraphMode('load')}
                className={`rounded px-2.5 py-1 text-xs font-medium ${addGraphMode === 'load' ? 'border border-amber-300 bg-amber-100 text-amber-900' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                Load saved
              </button>
            </div>
          </div>

          {addGraphMode === 'create' && (
            <div className="space-y-3">
              {renderGraphDraftSettings('Save graph')}
            </div>
          )}

          {addGraphMode === 'load' && (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-xs font-medium text-slate-700">Load saved graph</p>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                  <input
                    type="text"
                    value={sharedGraphSearch}
                    onChange={(event) => setSharedGraphSearch(event.target.value)}
                    placeholder="Search by graph or retailer"
                    className="rounded-md border border-gray-300 px-2 py-2 text-xs"
                  />
                  <select
                    value={selectedSharedGraphId}
                    onChange={(event) => {
                      const nextId = event.target.value
                      setSelectedSharedGraphId(nextId)
                      if (nextId) {
                        loadSharedGraphIntoDraft(nextId)
                      }
                    }}
                    className="rounded-md border border-gray-300 px-2 py-2 text-xs lg:col-span-2"
                  >
                    <option value="">Select a saved graph</option>
                    {sharedGraphs.map((graph) => (
                      <option key={`shared-graph-${graph.id}`} value={String(graph.id)}>
                        {graph.name} - {graph.retailer_name}
                      </option>
                    ))}
                  </select>
                </div>
                {sharedGraphsLoading && renderStatusMessage('Loading saved graphs…', 'loading', true)}
                {sharedGraphsError && renderStatusMessage(sharedGraphsError, 'error', true)}
              </div>

              {selectedSharedGraphId && (
                <div className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Selected graph settings</p>
                  {renderGraphDraftSettings('Save graph')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="order-1 bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-4">
          <DistributionStripExplainer />

          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              How You Compare to Similar Advertisers{selectedComparisonPeriodLabel ? ` (${selectedComparisonPeriodLabel})` : ''}
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Metric</label>
              <MetricToggleGroup
                options={METRIC_OPTIONS}
                selected={visualPreviewMetric}
                onSelect={(nextMetric) => {
                  setMetric(nextMetric)
                  setVisualPreviewMetric(nextMetric)
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Scale</label>
              <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDistributionScaleMode('global-median-aligned')}
                  className={`rounded px-2 py-1 ${distributionScaleMode === 'global-median-aligned' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Align medians across rows with shared quartile context"
                >
                  Aligned
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionScaleMode('true-distribution')}
                  className={`rounded px-2 py-1 ${distributionScaleMode === 'true-distribution' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Use true min/max distances for this row"
                >
                  True
                </button>
              </div>
            </div>
          </div>

              <div className="space-y-3 border-t border-slate-100 pt-2">
                {distributionRows.map((row, rowIndex) => {
                  const hasAdminMembers = isAdminView && (distributionRowMembers[row.rowKey]?.length ?? 0) > 0

                  return (
                    <div
                      key={`distribution-row-${row.rowKey}`}
                      className={`space-y-2 pb-2 ${rowIndex < distributionRows.length - 1 ? 'border-b border-slate-100' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-[230px] shrink-0 space-y-2">
                          <div className="text-base font-semibold text-slate-800">{row.rowLabel}</div>
                          <div className="min-h-7 text-sm text-slate-700">
                            {row.selectedValues.length > 0 ? (
                              <div className="flex min-h-7 w-full flex-wrap content-start gap-1">
                                {row.selectedValues.map((value) => {
                                  const allocated = (retailerAllocatedByDomain[row.domainKey] ?? []).includes(value)
                                  return (
                                    <span
                                      key={`selected-pill-${row.rowKey}-${value}`}
                                      className={`inline-flex max-w-[220px] items-center justify-center truncate text-center rounded-md px-3 py-0.5 text-xs ${getSelectionPillClasses(allocated, 'strip')}`}
                                      title={value}
                                    >
                                      {value}
                                    </span>
                                  )
                                })}
                              </div>
                            ) : (
                              <div>All advertisers</div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDistributionTrendsOpen((current) => ({
                                ...current,
                                [row.rowKey]: !current[row.rowKey],
                              }))}
                              className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-xs leading-none transition-colors ${distributionTrendsOpen[row.rowKey]
                                ? 'border-amber-300 bg-amber-100 text-amber-900'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                              aria-label={distributionTrendsOpen[row.rowKey] ? `Hide ${row.rowLabel} trend` : `Show ${row.rowLabel} trend`}
                            >
                              <ChartSpline className="mx-auto h-4 w-4" />
                              <span>Trend</span>
                            </button>

                            {hasAdminMembers && (
                              <button
                                type="button"
                                onClick={() => setDistributionMembersOpen((current) => ({
                                  ...current,
                                  [row.rowKey]: !current[row.rowKey],
                                }))}
                                className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-xs leading-none transition-colors ${distributionMembersOpen[row.rowKey]
                                  ? 'border-sky-300 bg-sky-100 text-sky-900'
                                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                  }`}
                                aria-label={distributionMembersOpen[row.rowKey] ? `Hide ${row.rowLabel} cohort members` : `Show ${row.rowLabel} cohort members`}
                              >
                                <Users className="mx-auto h-4 w-4" />
                                <span>Members</span>
                              </button>
                            )}
                          </div>
                        </div>

                      <CohortDistributionStrip
                        aggregate={row.aggregate}
                        distributionDeltaMax={distributionDeltaMax}
                        rowIndex={rowIndex}
                        valueFormatter={(value) => formatMetricValue(visualPreviewMetric, value)}
                        chartHeightClass="h-[110px]"
                        emptyStateHeightClass="h-[72px]"
                        positioningMode={distributionScaleMode}
                        globalQuartileBounds={globalQuartileBounds}
                      />
                      </div>

                      {distributionMembersOpen[row.rowKey] && isAdminView && (
                        <div className="ml-[242px] rounded-md border border-sky-200 bg-sky-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Cohort members for current period</p>
                          <div className="mt-2 max-h-56 overflow-auto rounded border border-sky-100 bg-white">
                            <table className="min-w-full text-xs">
                              <thead className="bg-sky-50 text-sky-900">
                                <tr>
                                  <th className="px-2 py-1 text-left font-medium">Retailer</th>
                                  <th className="px-2 py-1 text-right font-medium">Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(distributionRowMembers[row.rowKey] ?? []).map((member) => (
                                  <tr key={`member-${row.rowKey}-${member.retailer_id}`} className="border-t border-sky-100">
                                    <td className="px-2 py-1 text-slate-700">{member.retailer_name}</td>
                                    <td className="px-2 py-1 text-right text-slate-900">{formatMetricValue(visualPreviewMetric, member.metric_value ?? null)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {distributionTrendsOpen[row.rowKey] && (
                        <div className="ml-[242px]">
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="mb-2 text-xs font-medium text-slate-600">{row.rowLabel} Cohort for {METRIC_OPTIONS.find((option) => option.key === visualPreviewMetric)?.label}</p>
                            <CohortBandTrendChart
                              data={distributionRowTrends[row.rowKey] ?? []}
                              valueFormatter={(value) => formatMetricValue(visualPreviewMetric, value)}
                              yTickFormatter={(value) => {
                                if (visualPreviewMetric === 'gmv') return formatCurrency(Number(value))
                                if (toPercentMetric(visualPreviewMetric)) return `${Number(value).toFixed(1)}%`
                                return formatNumber(Number(value))
                              }}
                              labelFormatter={(_label, payload) => {
                                const periodKey = payload?.[0]?.payload?.periodKey
                                if (!periodKey) return String(_label ?? '')
                                return overviewView === 'monthly' ? formatMonthLabel(periodKey) : formatWeekLabel(periodKey)
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {distributionLoading && renderStatusMessage('Refreshing domain rows...', 'loading')}
              {distributionError && renderStatusMessage(distributionError, 'error')}
              {!distributionLoading && distributionRows.length === 0 && (
                renderStatusMessage('Select at least one value within the chosen domains to render rows.')
              )}

            </div>
        </div>
      </div>
  )
}
