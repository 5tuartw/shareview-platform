'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCcw } from 'lucide-react'
import { ContextualInfoPanel, InsightsPanel, QuickStatsBar } from '@/components/shared'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import OverviewSubTabs from '@/components/client/OverviewSubTabs'
import GMVCommissionChart from '@/components/client/charts/GMVCommissionChart'
import ConversionsCVRChart from '@/components/client/charts/ConversionsCVRChart'
import ImpressionsClicksChart from '@/components/client/charts/ImpressionsClicksChart'
import ROIProfitChart from '@/components/client/charts/ROIProfitChart'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { PageInsightsResponse } from '@/types'
import type { AvailableMonth } from '@/lib/analytics-utils'

interface OverviewTabProps {
  retailerId: string
  apiBase?: string
  retailerConfig?: { insights: boolean; market_insights: boolean }
  visibleMetrics?: string[]
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
}

const toUtcDate = (value?: string | null): Date | null => {
  if (!value) return null
  const dateOnly = value.slice(0, 10)
  const candidate = value.includes('T') ? value : `${dateOnly}T00:00:00Z`
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const weekLabelFromPeriod = (value?: string | null): string => {
  const parsed = toUtcDate(value)
  if (!parsed) return 'w/c -'
  return `w/c ${parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`
}

export default function OverviewTab({ retailerId, apiBase, retailerConfig, visibleMetrics, onAvailableMonths, onAvailableWeeks }: OverviewTabProps) {
  const { period, periodType, start, end, overviewView, windowSize, weekPeriod, setWeekPeriod } = useDateRange()
  const [activeSubTab, setActiveSubTab] = useState('performance')
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null)
  const [insights, setInsights] = useState<PageInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const features = retailerConfig || { insights: true, market_insights: true }
  const allowedTabs = useMemo(() => {
    return [
      'performance',
      ...(features.market_insights ? ['market-comparison'] : []),
      ...(features.insights ? ['insights'] : []),
    ]
  }, [features.insights, features.market_insights])

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

  const fetchInsights = async (tab: string) => {
    const base = apiBase ?? '/api'
    const response = await fetch(
      `${base}/page-insights?retailerId=${retailerId}&pageType=overview&tab=${tab}&period=${period}`
    )

    if (!response.ok) {
      throw new Error('Unable to load insights')
    }

    return (await response.json()) as PageInsightsResponse
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [overviewResponse, insightsResponse] = await Promise.all([
        fetch(`${apiBase ?? '/api'}/retailers/${retailerId}/overview?view_type=${overviewView}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetchInsights(activeSubTab === 'market-comparison' ? 'market-insights' : activeSubTab),
      ])

      if (!overviewResponse.ok) {
        throw new Error('Unable to load overview data')
      }

      const overviewJson = (await overviewResponse.json()) as OverviewResponse
      const insightsJson = insightsResponse

      setOverviewData(overviewJson)
      setInsights(insightsJson)

      if (Array.isArray(overviewJson.available_months) && overviewJson.available_months.length > 0) {
        onAvailableMonths?.(overviewJson.available_months)
      } else if (overviewView === 'monthly') {
        const fallbackMonths = Array.from(
          new Set(overviewJson.history.map((h) => h.period_start.slice(0, 7)))
        )
          .sort()
          .map((month) => ({ period: month, actualStart: null, actualEnd: null }))
        onAvailableMonths?.(fallbackMonths)
      }

      // For weekly view, derive available weeks from history and surface them
      if (overviewView === 'weekly' && Array.isArray(overviewJson.history)) {
        const weeks = overviewJson.history
          .map((h) => h.period_start.slice(0, 10))
          .filter((p) => !!toUtcDate(p))
          .filter((p, i, arr) => arr.indexOf(p) === i)
          .sort()
          .map((period) => ({
            period,
            label: weekLabelFromPeriod(period),
          }))
        onAvailableWeeks?.(weeks)
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
  }

  useEffect(() => {
    if (!retailerId) return
    loadData()
  }, [retailerId, period, activeSubTab, overviewView, weekPeriod])

  const chartData = useMemo(() => {
    if (!overviewData?.history) return []

    return overviewData.history.map((item) => ({
      label: overviewView === 'monthly'
        ? new Date(item.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
        : weekLabelFromPeriod(item.period_start),
      periodStart: item.period_start,
      gmv: item.gmv,
      commission: item.commission ?? item.gmv * 0.05, // Use actual commission or estimate as 5% of GMV
      conversions: item.conversions,
      // cvr stored as fraction (0–1) in DB; multiply to percentage for display
      cvr: (item.cvr ?? 0) * 100,
      impressions: item.impressions,
      clicks: item.clicks,
      roi: item.roi,
      profit: item.profit,
    }))
  }, [overviewData])

  const { windowedData } = useMemo(() => {
    if (!chartData.length) return { windowedData: [] as typeof chartData }

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

    const sliceStart = Math.max(0, anchorIdx - windowSize + 1)
    return { windowedData: chartData.slice(sliceStart, anchorIdx + 1) }
  }, [chartData, period, weekPeriod, windowSize, overviewView])

  // Aggregate metrics only for data points that fall within the selected period so that
  // the metric cards reflect the current month rather than always the latest data point.
  const currentPeriodMetrics = useMemo(() => {
    if (!overviewData) return null
    if (!chartData.length || !period) return null

    const periodStartDate = new Date(`${period}-01`)
    const [year, month] = period.split('-').map(Number)
    const periodEndDate = new Date(year, month, 0)

    const pts = chartData.filter((item) => {
      const d = toUtcDate(item.periodStart)
      if (!d) return false
      return d >= periodStartDate && d <= periodEndDate
    })

    if (!pts.length) return null

    const totalImpressions = pts.reduce((s, p) => s + (p.impressions ?? 0), 0)
    const totalClicks = pts.reduce((s, p) => s + (p.clicks ?? 0), 0)
    const totalConversions = pts.reduce((s, p) => s + (p.conversions ?? 0), 0)
    const totalGMV = pts.reduce((s, p) => s + (p.gmv ?? 0), 0)
    const totalProfit = pts.reduce((s, p) => s + (p.profit ?? 0), 0)
    const avgROI = pts.reduce((s, p) => s + (p.roi ?? 0), 0) / pts.length

    return {
      gmv: totalGMV,
      conversions: totalConversions,
      profit: totalProfit,
      roi: avgROI,
      impressions: totalImpressions,
      clicks: totalClicks,
      // Derive CTR and CVR from aggregated totals to avoid fraction vs % ambiguity
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      cvr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      validation_rate: overviewData.metrics.validation_rate,
    }
  }, [chartData, period, overviewData])

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
    : new Date(`${period}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-8">
      <OverviewSubTabs
        activeSubTab={activeSubTab}
        onSubTabChange={setActiveSubTab}
        retailerConfig={{
          insights: features.insights !== false,
          market_insights: features.market_insights !== false,
        }}
      />



      {activeSubTab === 'performance' && (
        <>
          <QuickStatsBar items={[
            { key: 'gmv', label: 'Total GMV', value: formatCurrency((currentPeriodMetrics ?? overviewData.metrics).gmv), change: overviewData.comparisons.gmv_change_pct },
            { key: 'conversions', label: 'Total Conversions', value: formatNumber((currentPeriodMetrics ?? overviewData.metrics).conversions), change: overviewData.comparisons.conversions_change_pct },
            { key: 'cvr', label: 'CVR', value: `${(currentPeriodMetrics?.cvr ?? overviewData.metrics.cvr * 100).toFixed(2)}%` },
            { key: 'ctr', label: 'CTR', value: `${(currentPeriodMetrics?.ctr ?? overviewData.metrics.ctr * 100).toFixed(2)}%` },
          ].filter(item => !visibleMetrics?.length || visibleMetrics.includes(item.key)).map(({ key: _key, ...rest }) => rest) as any} />

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
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">GMV & Commission</h3>
              <GMVCommissionChart data={windowedData} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Conversions & CVR</h3>
              <ConversionsCVRChart data={windowedData} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Impressions & Clicks</h3>
              <ImpressionsClicksChart data={windowedData} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">ROI & Profit</h3>
              <ROIProfitChart data={windowedData} />
            </div>
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
        showInsightsPanel && insights?.insightsPanel ? (
          <InsightsPanel
            title={insights.insightsPanel.title || 'Market Comparison'}
            insights={insights.insightsPanel.insights}
            singleColumn={insights.insightsPanel.singleColumn}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
            No market comparison data published for this period yet.
          </div>
        )
      )}

      {activeSubTab === 'insights' && (
        showInsightsPanel && insights?.insightsPanel ? (
          <InsightsPanel
            title={insights.insightsPanel.title || 'Insights'}
            insights={insights.insightsPanel.insights}
            singleColumn={insights.insightsPanel.singleColumn}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
            No insights published for this period yet.
          </div>
        )
      )}
    </div>
  )
}
