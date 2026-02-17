'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCcw } from 'lucide-react'
import { PageHeadline, ContextualInfoPanel, InsightsPanel } from '@/components/shared'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import OverviewSubTabs from '@/components/client/OverviewSubTabs'
import GMVCommissionChart from '@/components/client/charts/GMVCommissionChart'
import ConversionsCVRChart from '@/components/client/charts/ConversionsCVRChart'
import ImpressionsClicksChart from '@/components/client/charts/ImpressionsClicksChart'
import ROIProfitChart from '@/components/client/charts/ROIProfitChart'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { PageInsightsResponse } from '@/types'

interface OverviewTabProps {
  retailerId: string
  retailerConfig?: { insights: boolean; market_insights: boolean }
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
}

export default function OverviewTab({ retailerId, retailerConfig }: OverviewTabProps) {
  const { period, periodType, start, end } = useDateRange()
  const [activeSubTab, setActiveSubTab] = useState('performance')
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null)
  const [insights, setInsights] = useState<PageInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const features = retailerConfig || { insights: true, market_insights: true }
  const allowedTabs = useMemo(() => {
    return [
      'performance',
      ...(features.insights ? ['insights'] : []),
      ...(features.market_insights ? ['market-insights'] : []),
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
    const response = await fetch(
      `/api/page-insights?retailerId=${retailerId}&pageType=overview&tab=${tab}&period=${period}`
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
        fetch(`/api/retailers/${retailerId}/overview?view_type=weekly`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetchInsights(activeSubTab === 'market-insights' ? 'market-insights' : activeSubTab),
      ])

      if (!overviewResponse.ok) {
        throw new Error('Unable to load overview data')
      }

      const overviewJson = (await overviewResponse.json()) as OverviewResponse
      const insightsJson = insightsResponse

      setOverviewData(overviewJson)
      setInsights(insightsJson)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load overview data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!retailerId) return
    loadData()
  }, [retailerId, period, activeSubTab])

  const chartData = useMemo(() => {
    if (!overviewData?.history) return []

    return overviewData.history.map((item) => ({
      label: new Date(item.period_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      gmv: item.gmv,
      commission: item.commission ?? item.gmv * 0.05, // Use actual commission or estimate as 5% of GMV
      conversions: item.conversions,
      cvr: item.cvr,
      impressions: item.impressions,
      clicks: item.clicks,
      roi: item.roi,
      profit: item.profit,
    }))
  }, [overviewData])

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

  const showHeadline = periodType !== 'custom' && insights?.headline
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
          {showHeadline && (
            <PageHeadline
              status={insights?.headline?.status || 'info'}
              message={insights?.headline?.message || ''}
              subtitle={insights?.headline?.subtitle}
            />
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
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">GMV & Commission</h3>
              <GMVCommissionChart data={chartData} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Conversions & CVR</h3>
              <ConversionsCVRChart data={chartData} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Impressions & Clicks</h3>
              <ImpressionsClicksChart data={chartData} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">ROI & Profit</h3>
              <ROIProfitChart data={chartData} />
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

      {activeSubTab === 'insights' && (
        showInsightsPanel && insights?.insightsPanel ? (
          <InsightsPanel
            title={insights.insightsPanel.title}
            insights={insights.insightsPanel.insights}
            singleColumn={insights.insightsPanel.singleColumn}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
            No insights published for this period yet.
          </div>
        )
      )}

      {activeSubTab === 'market-insights' && (
        showInsightsPanel && insights?.insightsPanel ? (
          <InsightsPanel
            title={insights.insightsPanel.title || 'Market Insights'}
            insights={insights.insightsPanel.insights}
            singleColumn={insights.insightsPanel.singleColumn}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
            No market insights published for this period yet.
          </div>
        )
      )}
    </div>
  )
}
