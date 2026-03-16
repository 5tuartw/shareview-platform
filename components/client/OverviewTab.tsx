'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, RefreshCcw } from 'lucide-react'
import { ContextualInfoPanel, InsightsPanel, QuickStatsBar } from '@/components/shared'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import OverviewSubTabs from '@/components/client/OverviewSubTabs'
import GMVCommissionChart from '@/components/client/charts/GMVCommissionChart'
import ConversionsCVRChart from '@/components/client/charts/ConversionsCVRChart'
import ImpressionsClicksChart from '@/components/client/charts/ImpressionsClicksChart'
import ROIProfitChart from '@/components/client/charts/ROIProfitChart'
import MarketComparisonPanel from '@/components/client/MarketComparisonPanel'
import HiddenForRetailerBadge from '@/components/client/HiddenForRetailerBadge'
import ComingSoonPanel from '@/components/client/ComingSoonPanel'
import { calculatePercentageChange } from '@/lib/analytics-utils'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { PageInsightsResponse } from '@/types'
import type { AvailableMonth, AvailableWeek } from '@/lib/analytics-utils'

interface OverviewTabProps {
  retailerId: string
  apiBase?: string
  isDemoRetailer?: boolean
  retailerConfig?: { insights: boolean; market_insights: boolean }
  visibleMetrics?: string[]
  isAdminView?: boolean
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
  onAvailableMonths?: (months: AvailableMonth[]) => void
  onAvailableWeeks?: (weeks: { period: string; label: string }[]) => void
}

interface OverviewResponse {
  metrics: {
    gmv: number
    conversions: number
    profit: number
    roi: number
    impressions: number
    clicks: number
    ctr: number
    cvr: number
    validation_rate: number
  }
  coverage?: {
    percentage: number
    products_with_ads: number
    total_products: number
  }
  history: Array<{
    period_start: string
    gmv: number
    conversions: number
    profit: number
    roi: number
    impressions: number
    clicks: number
    ctr: number
    cvr: number
    commission?: number
  }>
  comparisons: {
    gmv_change_pct: number | null
    conversions_change_pct: number | null
    roi_change_pct: number | null
  }
  last_updated: string
  available_months?: AvailableMonth[]
  available_weeks?: AvailableWeek[]
  snapshot_settings?: {
    view_type?: 'monthly' | 'weekly'
    month_period?: string
    week_period?: string
    window_size?: number
  }
  market_comparison_saved_graphs?: Array<{
    id: number
    name: string
    metric: 'gmv' | 'profit' | 'impressions' | 'clicks' | 'conversions' | 'ctr' | 'cvr' | 'roi'
    view_type: 'monthly' | 'weekly'
    period_start: string
    period_end: string
    include_provisional: boolean
    match_mode: 'all' | 'any'
    domain_match_modes?: Record<string, 'all' | 'any'>
    filters: Record<string, string[]>
    position: number
  }>
}

interface OverviewChartPoint {
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

interface MarketComparisonPoint {
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

const toUtcDate = (value?: string | null): Date | null => {
  if (!value) return null
  const dateOnly = value.slice(0, 10)
  const candidate = value.includes('T') ? value : `${dateOnly}T00:00:00Z`
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toFiniteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const toFiniteOrZero = (value: unknown): number => {
  const numeric = toFiniteOrNull(value)
  return numeric ?? 0
}

const weekLabelFromPeriod = (value?: string | null): string => {
  const parsed = toUtcDate(value)
  if (!parsed) return 'w/c -'
  return `w/c ${parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`
}

const monthLabelFromPeriod = (value?: string | null, includeYear = true): string => {
  const parsed = toUtcDate(value)
  if (!parsed) return 'Unknown month'
  return parsed.toLocaleDateString('en-GB', {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

const monthlyAxisLabel = (value: string, indexInWindow: number, showYear = true): string => {
  const parsed = toUtcDate(value)
  if (!parsed) return '-'
  if (!showYear) {
    return parsed.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  }
  const includeYearOnTick = indexInWindow === 0 || parsed.getUTCMonth() === 0
  return parsed.toLocaleDateString('en-GB', {
    month: 'short',
    ...(includeYearOnTick ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

const weeklyAxisLabel = (value: string, indexInWindow: number, showYear = true): string => {
  const parsed = toUtcDate(value)
  if (!parsed) return 'w/c -'
  if (!showYear) {
    return `w/c ${parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    })}`
  }
  const includeYearOnTick = indexInWindow === 0 || parsed.getUTCMonth() === 0
  return `w/c ${parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(includeYearOnTick ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })}`
}

export default function OverviewTab({ retailerId, apiBase, isDemoRetailer = false, retailerConfig, visibleMetrics, isAdminView = false, reportId, onAvailableMonths, onAvailableWeeks }: OverviewTabProps) {
  const {
    period,
    setPeriod,
    periodType,
    start,
    end,
    overviewView,
    setOverviewView,
    windowSize,
    setWindowSize,
    weekPeriod,
    setWeekPeriod,
  } = useDateRange()
  const [activeSubTab, setActiveSubTab] = useState('performance')
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null)
  const [insights, setInsights] = useState<PageInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickStatsMode, setQuickStatsMode] = useState<'point' | 'window'>('point')
  const onAvailableMonthsRef = useRef(onAvailableMonths)
  const onAvailableWeeksRef = useRef(onAvailableWeeks)

  useEffect(() => {
    onAvailableMonthsRef.current = onAvailableMonths
  }, [onAvailableMonths])

  useEffect(() => {
    onAvailableWeeksRef.current = onAvailableWeeks
  }, [onAvailableWeeks])

  const features = retailerConfig || { insights: true, market_insights: true }
  const showMarketComparisonTab = features.market_insights || isAdminView
  const marketComparisonHiddenForRetailer = isAdminView && !features.market_insights
  const allowedTabs = useMemo(() => {
    return [
      'performance',
      ...(showMarketComparisonTab ? ['market-comparison'] : []),
      ...(features.insights ? ['insights'] : []),
    ]
  }, [features.insights, showMarketComparisonTab])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialTab = params.get('subTab') || 'performance'
    setActiveSubTab(allowedTabs.includes(initialTab) ? initialTab : 'performance')
  }, [allowedTabs])

  useEffect(() => {
    if (!allowedTabs.includes(activeSubTab)) {
      setActiveSubTab('performance')
    }
  }, [activeSubTab, allowedTabs])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('subTab', activeSubTab)
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [activeSubTab])

  const fetchInsights = useCallback(async (tab: string) => {
    const base = apiBase ?? '/api'
    const response = await fetch(
      `${base}/page-insights?retailerId=${retailerId}&pageType=overview&tab=${tab}&period=${period}`
    )

    if (!response.ok) {
      throw new Error('Unable to load insights')
    }

    return (await response.json()) as PageInsightsResponse
  }, [apiBase, period, retailerId])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const overviewParams = new URLSearchParams({ view_type: overviewView })
      if (periodType === 'custom') {
        overviewParams.set('period_type', 'custom')
        overviewParams.set('start', start)
        overviewParams.set('end', end)
      } else if (overviewView === 'weekly') {
        if (weekPeriod) {
          overviewParams.set('week_period', weekPeriod)
        }
      } else {
        overviewParams.set('period', period)
      }

      const overviewEndpoint = reportId
        ? `${apiBase ?? '/api'}/reports/${reportId}/overview`
        : `${apiBase ?? '/api'}/retailers/${retailerId}/overview?${overviewParams.toString()}`

      const overviewResponse = await fetch(overviewEndpoint, {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!overviewResponse.ok) {
        throw new Error('Unable to load overview data')
      }

      const overviewJson = (await overviewResponse.json()) as OverviewResponse

      let insightsJson: PageInsightsResponse | null = null
      if (activeSubTab !== 'market-comparison') {
        try {
          insightsJson = await fetchInsights(activeSubTab)
        } catch (insightError) {
          // Report snapshots can have frozen performance data without matching insights payloads.
          // Do not block Overview rendering when insights are unavailable.
          console.warn('Overview insights unavailable:', insightError)
          insightsJson = null
        }
      }

      setOverviewData(overviewJson)
      setInsights(insightsJson)

      if (overviewView === 'monthly') {
        const persistedMonths = Array.isArray(overviewJson.available_months) ? overviewJson.available_months : []
        const liveHistoryMonths = Array.from(
          new Set((overviewJson.history ?? []).map((h) => h.period_start.slice(0, 7)))
        )
          .sort()
          .map((month) => ({ period: month, actualStart: null, actualEnd: null }))

        const mergedByPeriod = new Map<string, AvailableMonth>()
        for (const month of persistedMonths) mergedByPeriod.set(month.period, month)
        for (const month of liveHistoryMonths) {
          if (!mergedByPeriod.has(month.period)) {
            mergedByPeriod.set(month.period, month)
          }
        }

        onAvailableMonthsRef.current?.(
          Array.from(mergedByPeriod.values()).sort((a, b) => a.period.localeCompare(b.period))
        )
      }

      // For weekly view, prefer server-supplied available weeks (persisted availability table),
      // then fall back to deriving from history.
      if (overviewView === 'weekly' && Array.isArray(overviewJson.history)) {
        const persistedWeeks = Array.isArray(overviewJson.available_weeks) ? overviewJson.available_weeks : []
        const liveHistoryWeeks = overviewJson.history
          .map((h) => h.period_start.slice(0, 10))
          .filter((p) => !!toUtcDate(p))
          .filter((p, i, arr) => arr.indexOf(p) === i)
          .sort()
          .map((period) => ({
            period,
            label: weekLabelFromPeriod(period),
          }))

        const mergedByPeriod = new Map<string, { period: string; label: string }>()
        for (const week of persistedWeeks) mergedByPeriod.set(week.period, week)
        for (const week of liveHistoryWeeks) {
          if (!mergedByPeriod.has(week.period)) {
            mergedByPeriod.set(week.period, week)
          }
        }

        const weeks = Array.from(mergedByPeriod.values()).sort((a, b) => a.period.localeCompare(b.period))
        onAvailableWeeksRef.current?.(weeks)
        // Default weekPeriod to latest if not yet set
        if (!weekPeriod && weeks.length > 0) {
          setWeekPeriod(weeks[weeks.length - 1].period)
        }
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load overview data')
    } finally {
      setLoading(false)
    }
  }, [
    activeSubTab,
    apiBase,
    end,
    fetchInsights,
    overviewView,
    period,
    periodType,
    reportId,
    retailerId,
    setWeekPeriod,
    start,
    weekPeriod,
  ])

  useEffect(() => {
    if (!retailerId) return
    loadData()
  }, [loadData, retailerId])

  useEffect(() => {
    if (!reportId || !overviewData?.snapshot_settings) return

    const settings = overviewData.snapshot_settings
    const targetView = settings.view_type
    const targetWindow = settings.window_size
    const targetWeek = settings.week_period
    const targetMonth = settings.month_period

    if (targetView && targetView !== overviewView) {
      setOverviewView(targetView)
    }

    if (typeof targetWindow === 'number' && Number.isFinite(targetWindow) && targetWindow > 0 && targetWindow !== windowSize) {
      setWindowSize(targetWindow)
    }

    if (targetView === 'weekly' && targetWeek && targetWeek !== weekPeriod) {
      setWeekPeriod(targetWeek)
    }

    if (targetMonth && targetMonth !== period) {
      setPeriod(targetMonth)
    }
  }, [
    reportId,
    overviewData,
    overviewView,
    windowSize,
    weekPeriod,
    period,
    setOverviewView,
    setWindowSize,
    setWeekPeriod,
    setPeriod,
  ])

  const chartData = useMemo(() => {
    if (!overviewData?.history) return []

    const mapped: OverviewChartPoint[] = overviewData.history.map((item) => ({
      label: overviewView === 'monthly'
        ? monthLabelFromPeriod(item.period_start, !isDemoRetailer)
        : weekLabelFromPeriod(item.period_start),
      periodStart: item.period_start,
      gmv: toFiniteOrNull(item.gmv),
      commission: toFiniteOrNull(item.commission) ?? (toFiniteOrZero(item.gmv) * 0.05), // Use actual commission or estimate as 5% of GMV
      conversions: toFiniteOrNull(item.conversions),
      // cvr stored as fraction (0–1) in DB; multiply to percentage for display
      cvr: toFiniteOrZero(item.cvr) * 100,
      impressions: toFiniteOrNull(item.impressions),
      clicks: toFiniteOrNull(item.clicks),
      roi: toFiniteOrNull(item.roi),
      profit: toFiniteOrNull(item.profit),
    }))

    if (overviewView !== 'monthly' || mapped.length === 0) {
      return mapped
    }

    const toMonthKey = (date: Date): string => {
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      return `${year}-${month}`
    }

    const monthStartFromKey = (monthKey: string): string => `${monthKey}-01`

    const parsedRows = mapped
      .map((row) => {
        const parsed = toUtcDate(row.periodStart)
        if (!parsed) return null
        return {
          ...row,
          monthKey: toMonthKey(parsed),
        }
      })
      .filter((row): row is (OverviewChartPoint & { monthKey: string }) => row !== null)

    if (parsedRows.length === 0) return mapped

    parsedRows.sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    const byMonth = new Map(parsedRows.map((row) => [row.monthKey, row]))

    const start = toUtcDate(monthStartFromKey(parsedRows[0].monthKey))
    const end = toUtcDate(monthStartFromKey(parsedRows[parsedRows.length - 1].monthKey))
    if (!start || !end) return mapped

    const dense: OverviewChartPoint[] = []
    const cursor = new Date(start)

    while (cursor.getTime() <= end.getTime()) {
      const monthKey = toMonthKey(cursor)
      const existing = byMonth.get(monthKey)
      const periodStart = monthStartFromKey(monthKey)

      if (existing) {
        dense.push(existing)
      } else {
        dense.push({
          label: monthLabelFromPeriod(periodStart, !isDemoRetailer),
          periodStart,
          gmv: null,
          commission: null,
          conversions: null,
          cvr: null,
          impressions: null,
          clicks: null,
          roi: null,
          profit: null,
        })
      }

      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }

    return dense
  }, [overviewData, overviewView, isDemoRetailer])

  const marketComparisonData = useMemo<MarketComparisonPoint[]>(() => {
    if (!overviewData?.history) return []

    return overviewData.history.map((item) => {
      // Keep nulls as null so charts show gaps instead of synthetic zeros.
      // This avoids misleading zero points in Market Comparison graphs.
      const gmv = toFiniteOrNull(item.gmv)
      const cvr = toFiniteOrNull(item.cvr)
      const commission = toFiniteOrNull(item.commission)

      return {
        label: overviewView === 'monthly'
          ? monthLabelFromPeriod(item.period_start, !isDemoRetailer)
          : weekLabelFromPeriod(item.period_start),
        periodStart: item.period_start,
        gmv,
        commission: commission ?? (gmv !== null ? gmv * 0.05 : null),
        conversions: toFiniteOrNull(item.conversions),
        cvr: cvr !== null ? cvr * 100 : null,
        impressions: toFiniteOrNull(item.impressions),
        clicks: toFiniteOrNull(item.clicks),
        roi: toFiniteOrNull(item.roi),
        profit: toFiniteOrNull(item.profit),
      }
    })
  }, [overviewData, overviewView, isDemoRetailer])

  const { windowedData, selectedLabel, selectedPeriodText, anchorIdx, effectiveWindow } = useMemo(() => {
    if (!chartData.length) {
      return {
        windowedData: [] as typeof chartData,
        selectedLabel: undefined as string | undefined,
        selectedPeriodText: undefined as string | undefined,
        anchorIdx: 0,
        effectiveWindow: 0,
      }
    }

    // Find anchor: last item whose periodStart ≤ the selected anchor
    let anchorIdx = chartData.length - 1
    const anchorStr = overviewView === 'weekly' ? weekPeriod : period
    if (anchorStr) {
      const anchorDate = overviewView === 'monthly'
        ? toUtcDate(`${anchorStr}-01`)
        : toUtcDate(anchorStr)
      for (let i = chartData.length - 1; i >= 0; i--) {
        const rowDate = toUtcDate(chartData[i].periodStart)
        if (anchorDate && rowDate && rowDate <= anchorDate) {
          anchorIdx = i
          break
        }
      }
    }

    const effectiveWindowSize = Math.min(windowSize, chartData.length)
    const leftSlots = Math.floor((effectiveWindowSize - 1) / 2)
    const maxWindowStart = Math.max(0, chartData.length - effectiveWindowSize)
    const sliceStartIdx = Math.min(Math.max(0, anchorIdx - leftSlots), maxWindowStart)
    const sliceEnd = sliceStartIdx + effectiveWindowSize
    const selected = chartData[anchorIdx]
    const rawWindow = chartData.slice(sliceStartIdx, sliceEnd)
    const relabelledWindow = rawWindow.map((row, indexInWindow) => ({
      ...row,
      label: overviewView === 'monthly'
        ? monthlyAxisLabel(row.periodStart, indexInWindow, !isDemoRetailer)
        : weeklyAxisLabel(row.periodStart, indexInWindow, !isDemoRetailer),
    }))
    const selectedInWindow = relabelledWindow[anchorIdx - sliceStartIdx]

    return {
      windowedData: relabelledWindow,
      selectedLabel: selectedInWindow?.label,
      selectedPeriodText: selected
        ? overviewView === 'weekly'
          ? selected.label
          : new Date(selected.periodStart).toLocaleDateString('en-GB', {
              month: 'long',
              ...(!isDemoRetailer ? { year: 'numeric' } : {}),
              timeZone: 'UTC',
            })
        : undefined,
      anchorIdx,
      effectiveWindow: effectiveWindowSize,
    }
  }, [chartData, period, weekPeriod, windowSize, overviewView, isDemoRetailer])

  const selectedPointMetrics = useMemo(() => {
    if (!chartData.length || !overviewData) return null
    const row = chartData[anchorIdx]
    if (!row) return null
    return {
      gmv: row.gmv ?? 0,
      conversions: row.conversions ?? 0,
      profit: row.profit ?? 0,
      roi: row.roi ?? 0,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr: (row.impressions ?? 0) > 0 ? ((row.clicks ?? 0) / (row.impressions ?? 0)) * 100 : 0,
      cvr: row.cvr ?? 0,
      validation_rate: overviewData.metrics.validation_rate,
    }
  }, [chartData, anchorIdx, overviewData])

  const selectedWindowMetrics = useMemo(() => {
    if (!windowedData.length || !overviewData) return null
    const totalImpressions = windowedData.reduce((s, p) => s + toFiniteOrZero(p.impressions), 0)
    const totalClicks = windowedData.reduce((s, p) => s + toFiniteOrZero(p.clicks), 0)
    const totalConversions = windowedData.reduce((s, p) => s + toFiniteOrZero(p.conversions), 0)
    const totalGMV = windowedData.reduce((s, p) => s + toFiniteOrZero(p.gmv), 0)
    const totalProfit = windowedData.reduce((s, p) => s + toFiniteOrZero(p.profit), 0)
    const avgROI = windowedData.reduce((s, p) => s + toFiniteOrZero(p.roi), 0) / windowedData.length

    return {
      gmv: totalGMV,
      conversions: totalConversions,
      profit: totalProfit,
      roi: avgROI,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      cvr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      validation_rate: overviewData.metrics.validation_rate,
    }
  }, [windowedData, overviewData])

  const quickStatsMetrics = quickStatsMode === 'window' ? selectedWindowMetrics : selectedPointMetrics

  const quickStatsComparisons = useMemo(() => {
    if (!chartData.length) return { gmv_change_pct: null as number | null, conversions_change_pct: null as number | null }

    if (quickStatsMode === 'point') {
      const selected = chartData[anchorIdx]
      const previous = chartData[anchorIdx - 1]
      return {
        gmv_change_pct: calculatePercentageChange(selected?.gmv ?? null, previous?.gmv ?? null),
        conversions_change_pct: calculatePercentageChange(selected?.conversions ?? null, previous?.conversions ?? null),
      }
    }

    if (quickStatsMode === 'window' || effectiveWindow <= 0) {
      return { gmv_change_pct: null as number | null, conversions_change_pct: null as number | null }
    }

    return { gmv_change_pct: null as number | null, conversions_change_pct: null as number | null }
  }, [quickStatsMode, chartData, anchorIdx, effectiveWindow])

  const reportQuickStatsLabels = useMemo(() => {
    if (!reportId) return null

    const monthLong = (value: string | undefined): string => {
      if (!value) return 'Month'
      const parsed = toUtcDate(value)
      if (!parsed) return 'Month'
      return parsed.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
    }

    const monthShort = (value: string | undefined): string => {
      if (!value) return 'Mon'
      const parsed = toUtcDate(value)
      if (!parsed) return 'Mon'
      return parsed.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
    }

    const oneMonthLabel = monthLong(chartData[anchorIdx]?.periodStart)
    const rangeStart = windowedData[0]?.periodStart
    const rangeEnd = windowedData[windowedData.length - 1]?.periodStart
    const twelveMonthLabel = rangeStart && rangeEnd
      ? `${monthShort(rangeStart)} - ${monthShort(rangeEnd)}`
      : '12 months'

    return {
      oneMonthLabel,
      twelveMonthLabel,
    }
  }, [reportId, chartData, anchorIdx, windowedData])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-20 rounded-lg bg-gray-200 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-64 rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start gap-3 text-amber-600">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">Overview data unavailable</h3>
              <p className="text-sm text-gray-600 mt-1">{error}</p>
              <button
                type="button"
                onClick={loadData}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <RefreshCcw className="w-4 h-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!overviewData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
        No data available for this period.
      </div>
    )
  }

  const showContextual = periodType !== 'custom' && insights?.contextualInfo
  const showInsightsPanel = insights?.insightsPanel

  const periodLabel = periodType === 'custom'
    ? `${start} to ${end}`
    : new Date(`${period}-01`).toLocaleDateString('en-GB', {
        month: 'long',
        ...(!isDemoRetailer ? { year: 'numeric' } : {}),
      })

  const isMetricVisible = (metric: string) => !visibleMetrics?.length || visibleMetrics.includes(metric)
  const showGMV = isMetricVisible('gmv')
  const showCommission = isMetricVisible('commission')
  const showConversions = isMetricVisible('conversions')
  const showCVR = isMetricVisible('cvr')
  const showImpressions = isMetricVisible('impressions')
  const showClicks = isMetricVisible('clicks')
  const showROI = isMetricVisible('roi')
  const showProfit = isMetricVisible('profit')

  const resolvePairTitle = (
    pairTitle: string,
    leftTitle: string,
    rightTitle: string,
    showLeft: boolean,
    showRight: boolean
  ) => {
    if (isAdminView) return pairTitle
    if (showLeft && showRight) return pairTitle
    if (showLeft) return leftTitle
    if (showRight) return rightTitle
    return pairTitle
  }

  const renderChartTitle = (title: string, hiddenMetricLabels: string[] = []) => (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{title}</h3>
      {isAdminView && hiddenMetricLabels.length > 0 && (
        <HiddenForRetailerBadge
          label={
            hiddenMetricLabels.length === 1
              ? `${hiddenMetricLabels[0]} hidden from retailer`
              : 'Hidden for retailer'
          }
        />
      )}
    </div>
  )

  return (
    <div className="space-y-8">
      <OverviewSubTabs
        activeSubTab={activeSubTab}
        onSubTabChange={setActiveSubTab}
        retailerConfig={{
          insights: features.insights !== false,
          market_insights: showMarketComparisonTab,
        }}
        marketComparisonHiddenForRetailer={marketComparisonHiddenForRetailer}
      />



      {activeSubTab === 'performance' && (
        <>
          <div className="flex justify-start">
            <div className="inline-flex rounded border border-gray-200 overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => setQuickStatsMode('point')}
                className={`px-3 py-1.5 transition-colors ${
                  quickStatsMode === 'point'
                    ? 'bg-[#1C1D1C] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {reportId ? 'One month' : (overviewView === 'weekly' ? 'Selected week' : 'Selected month')}
              </button>
              <button
                type="button"
                onClick={() => setQuickStatsMode('window')}
                className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${
                  quickStatsMode === 'window'
                    ? 'bg-[#1C1D1C] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {reportId ? '12 months' : 'Selected range'}
              </button>
            </div>
          </div>

          <QuickStatsBar items={[
            {
              metricKey: 'gmv',
              label: reportId
                ? `GMV (${quickStatsMode === 'window' ? (reportQuickStatsLabels?.twelveMonthLabel ?? '12 months') : (reportQuickStatsLabels?.oneMonthLabel ?? 'Month')})`
                : (quickStatsMode === 'window' ? 'GMV (range)' : 'GMV (period)'),
              value: formatCurrency(toFiniteOrZero(quickStatsMetrics?.gmv ?? overviewData.metrics.gmv)),
              change: quickStatsComparisons.gmv_change_pct,
            },
            {
              metricKey: 'conversions',
              label: reportId
                ? `Conversions (${quickStatsMode === 'window' ? (reportQuickStatsLabels?.twelveMonthLabel ?? '12 months') : (reportQuickStatsLabels?.oneMonthLabel ?? 'Month')})`
                : (quickStatsMode === 'window' ? 'Conversions (range)' : 'Conversions (period)'),
              value: formatNumber(quickStatsMetrics?.conversions ?? overviewData.metrics.conversions),
              change: quickStatsComparisons.conversions_change_pct,
            },
            {
              metricKey: 'cvr',
              label: 'CVR',
              value: `${(quickStatsMetrics?.cvr ?? overviewData.metrics.cvr * 100).toFixed(2)}%`,
            },
            {
              metricKey: 'ctr',
              label: 'CTR',
              value: `${(quickStatsMetrics?.ctr ?? overviewData.metrics.ctr * 100).toFixed(2)}%`,
            },
          ]
            .filter((item) => !visibleMetrics?.length || visibleMetrics.includes(item.metricKey))
            .map((item) => ({
              label: item.label,
              value: item.value,
              ...(item.change != null ? { change: item.change } : {}),
            }))} />

          {!reportId && (
            <p className="-mt-4 text-xs text-gray-500">
              Quick stats based on: {quickStatsMode === 'window'
                ? `${windowSize} ${overviewView === 'weekly' ? 'week' : 'month'} range`
                : (selectedPeriodText ?? (overviewView === 'weekly' ? 'selected week' : 'selected month'))}
            </p>
          )}

          {periodType === 'custom' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900">Generate insights for this period</h3>
              <p className="text-sm text-gray-600 mt-2">
                Insights are not yet published for {periodLabel}. Trigger insight generation to unlock the full overview.
              </p>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#1C1D1C] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              >
                Generate insights
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(showGMV || showCommission || isAdminView) ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                {renderChartTitle(
                  resolvePairTitle('GMV & Commission', 'GMV', 'Commission', showGMV, showCommission),
                  [
                    ...(!showGMV ? ['GMV'] : []),
                    ...(!showCommission ? ['Commission'] : []),
                  ]
                )}
                <GMVCommissionChart
                  data={windowedData}
                  highlightX={selectedLabel}
                />
              </div>
            ) : null}

            {(showConversions || showCVR || isAdminView) ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                {renderChartTitle(
                  resolvePairTitle('Conversions & CVR', 'Conversions', 'CVR', showConversions, showCVR),
                  [
                    ...(!showConversions ? ['Conversions'] : []),
                    ...(!showCVR ? ['CVR'] : []),
                  ]
                )}
                <ConversionsCVRChart
                  data={windowedData}
                  highlightX={selectedLabel}
                />
              </div>
            ) : null}

            {(showImpressions || showClicks || isAdminView) ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                {renderChartTitle(
                  resolvePairTitle('Impressions & Clicks', 'Impressions', 'Clicks', showImpressions, showClicks),
                  [
                    ...(!showImpressions ? ['Impressions'] : []),
                    ...(!showClicks ? ['Clicks'] : []),
                  ]
                )}
                <ImpressionsClicksChart
                  data={windowedData}
                  highlightX={selectedLabel}
                />
              </div>
            ) : null}

            {(showROI || showProfit || isAdminView) ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                {renderChartTitle(
                  resolvePairTitle('ROI & Profit', 'ROI', 'Profit', showROI, showProfit),
                  [
                    ...(!showROI ? ['ROI'] : []),
                    ...(!showProfit ? ['Profit'] : []),
                  ]
                )}
                <ROIProfitChart
                  data={windowedData}
                  highlightX={selectedLabel}
                />
              </div>
            ) : null}
          </div>

          {showContextual && insights?.contextualInfo && (
            <ContextualInfoPanel
              title={insights.contextualInfo.title}
              style={insights.contextualInfo.style}
              items={insights.contextualInfo.items}
            />
          )}
        </>
      )}

      {activeSubTab === 'market-comparison' && (
        <MarketComparisonPanel
          retailerId={retailerId}
          apiBase={apiBase}
          overviewView={overviewView}
          period={period}
          weekPeriod={weekPeriod}
          windowSize={windowSize}
          data={marketComparisonData}
          isAdminView={isAdminView}
          reportId={reportId}
          snapshotSavedGraphs={overviewData?.market_comparison_saved_graphs ?? []}
        />
      )}

      {activeSubTab === 'insights' && (
        showInsightsPanel && insights?.insightsPanel ? (
          <InsightsPanel
            title={insights.insightsPanel.title || 'Insights'}
            insights={insights.insightsPanel.insights}
            singleColumn={insights.insightsPanel.singleColumn}
          />
        ) : (
          <ComingSoonPanel className="p-6" />
        )
      )}
    </div>
  )
}
