'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ClientTabNavigation from '@/components/client/ClientTabNavigation'
import OverviewTab from '@/components/client/OverviewTab'
import KeywordsTab from '@/components/client/KeywordsTab'
import CategoriesContent from '@/components/client/CategoriesContent'
import ProductsContent from '@/components/client/ProductsContent'
import AuctionsTab from '@/components/client/AuctionsTab'
import type { RetailerConfigResponse } from '@/types'
import PeriodSelector from '@/components/client/PeriodSelector'
import type { AvailableMonth } from '@/lib/analytics-shared'

type AvailabilityDomain = 'overview' | 'keywords' | 'categories' | 'products' | 'auctions'

interface AvailabilityMeta {
  auctions?: {
    months_with_any_data?: string[]
    months_displayable?: string[]
    latest_displayable_month?: string | null
  }
}

interface RetailerClientDashboardProps {
  retailerId: string
  retailerName: string
  config: RetailerConfigResponse
  isDemoRetailer?: boolean
  apiBase?: string
  reportsApiUrl?: string
  reportId?: number
  reportPeriod?: {
    start: string
    end: string
    type: string
  }
  reportInfo?: {
    title: string | null
    period_start: string
    period_end: string
    period_type?: string
  }
}

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']

export default function RetailerClientDashboard({ retailerId, retailerName, config, isDemoRetailer = false, apiBase, reportsApiUrl, reportId, reportPeriod, reportInfo }: RetailerClientDashboardProps) {
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const router = useRouter()
  const visibleTabs = config.visible_tabs?.length ? config.visible_tabs : DEFAULT_TABS
  const visibleMetrics = config.visible_metrics || []
  const featuresEnabled = config.features_enabled || {}
  const auctionsSelectedMetrics = Array.isArray(featuresEnabled.auctions_selected_metrics)
    ? (featuresEnabled.auctions_selected_metrics as string[])
    : undefined
  const keywordFilters = config.keyword_filters || []
  const isReportView = !!reportId

  // Debug: Log the entire features_enabled object
  console.log('[RetailerClientDashboard] featuresEnabled:', featuresEnabled)

  const availableTabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'keywords', label: 'Search Terms' },
      { id: 'categories', label: 'Categories' },
      { id: 'products', label: 'Products' },
      { id: 'auctions', label: 'Auctions' },
    ],
    []
  )

  const deriveTabFromParams = (params: URLSearchParams) => {
    const tabParam = params.get('tab')
    if (tabParam && tabs.find((t) => t.id === tabParam)) {
      return tabParam
    }

    const legacySubTab = params.get('subTab')
    if (legacySubTab && tabs.find((t) => t.id === legacySubTab)) {
      return legacySubTab
    }

    if (params.get('searchTermsSubTab') && tabs.find((t) => t.id === 'keywords')) return 'keywords'
    if (params.get('productsSubTab') && tabs.find((t) => t.id === 'products')) return 'products'

    return tabs[0]?.id || 'overview'
  }

  const tabs = availableTabs.filter((tab) => visibleTabs.includes(tab.id))

  const activeTab = useMemo(
    () => deriveTabFromParams(new URLSearchParams(searchParamsString)),
    [searchParamsString, tabs]
  )

  // Update URL when tab changes
  const handleTabChange = (tabId: string) => {
    const params = new URLSearchParams(searchParamsString)
    params.set('tab', tabId)

    // Avoid stale sub-tab params pulling tab inference back to a previous domain.
    if (tabId !== 'products') params.delete('productsSubTab')
    if (tabId !== 'keywords') params.delete('searchTermsSubTab')
    if (tabId !== 'overview') params.delete('subTab')

    router.replace(`?${params.toString()}`)
  }

  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([])
  const handleAvailableMonths = (months: AvailableMonth[]) => setAvailableMonths(months)
  const [availableWeeks, setAvailableWeeks] = useState<{ period: string; label: string }[]>([])
  const handleAvailableWeeks = (weeks: { period: string; label: string }[]) => setAvailableWeeks(weeks)
  const [availableMonthsByDomain, setAvailableMonthsByDomain] = useState<Record<AvailabilityDomain, AvailableMonth[]>>({
    overview: [],
    keywords: [],
    categories: [],
    products: [],
    auctions: [],
  })
  const [availabilityMeta, setAvailabilityMeta] = useState<AvailabilityMeta>({})

  useEffect(() => {
    let cancelled = false

    const loadPeriodAvailability = async () => {
      try {
        const response = await fetch(`${apiBase ?? '/api'}/retailers/${retailerId}/period-availability`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!response.ok) return
        const payload = await response.json() as {
          available_months?: AvailableMonth[]
          available_weeks?: Array<{ period: string; label: string }>
          available_months_by_domain?: Record<AvailabilityDomain, AvailableMonth[]>
          availability_meta?: AvailabilityMeta
        }

        if (cancelled) return
        setAvailableMonths(Array.isArray(payload.available_months) ? payload.available_months : [])
        setAvailableWeeks(Array.isArray(payload.available_weeks) ? payload.available_weeks : [])
        if (payload.available_months_by_domain) {
          setAvailableMonthsByDomain(payload.available_months_by_domain)
        }
        setAvailabilityMeta(payload.availability_meta ?? {})
      } catch {
        // Keep existing fallback behaviour when availability preload fails.
      }
    }

    loadPeriodAvailability()
    return () => {
      cancelled = true
    }
  }, [retailerId, apiBase])

  // Check sub-tab visibility based on features_enabled settings per tab
  const getSubTabVisibility = (mainTab: string) => {
    const result = {
      marketComparison: featuresEnabled[`${mainTab}_market_comparison_enabled`] !== false,
      insights: featuresEnabled[`${mainTab}_insights_enabled`] !== false,
      wordAnalysis: featuresEnabled[`${mainTab}_word_analysis_enabled`] !== false,
    }
    console.log(`[RetailerClientDashboard] getSubTabVisibility('${mainTab}'):`, {
      marketComparisonKey: `${mainTab}_market_comparison_enabled`,
      marketComparisonValue: featuresEnabled[`${mainTab}_market_comparison_enabled`],
      insightsKey: `${mainTab}_insights_enabled`,
      insightsValue: featuresEnabled[`${mainTab}_insights_enabled`],
      result
    })
    return result
  }

  const showCompetitorComparison = featuresEnabled.competitor_comparison !== false
  const showMarketInsights = featuresEnabled.market_insights !== false
  const showReportsTab = !isReportView && featuresEnabled.show_reports_tab === true

  const unavailablePeriods = useMemo(() => {
    const domain = (activeTab as AvailabilityDomain)
    const availableForDomain = new Set((availableMonthsByDomain[domain] ?? []).map((month) => month.period))
    return availableMonths
      .map((month) => month.period)
      .filter((period) => !availableForDomain.has(period))
  }, [activeTab, availableMonths, availableMonthsByDomain])

  const unavailableTooltipsByPeriod = useMemo(() => {
    if (activeTab !== 'auctions') return {}

    const currentMonth = new Date().toISOString().slice(0, 7)
    const latestDisplayable = availabilityMeta.auctions?.latest_displayable_month ?? null
    const anyDataMonths = new Set(availabilityMeta.auctions?.months_with_any_data ?? [])

    const tooltips: Record<string, string> = {}
    for (const period of unavailablePeriods) {
      if (latestDisplayable && period > latestDisplayable && period <= currentMonth) {
        tooltips[period] = 'Data not yet available'
      } else if (anyDataMonths.has(period)) {
        tooltips[period] = 'Other data exists for this retailer in a different campaign/account'
      } else {
        tooltips[period] = 'No data available'
      }
    }
    return tooltips
  }, [activeTab, unavailablePeriods, availabilityMeta])



  const formatReportDateRange = (start: string, end: string) => {
    const s = new Date(start)
    const e = new Date(end)
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
    const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long' })
    const yearFmt = new Intl.DateTimeFormat('en-GB', { year: 'numeric' })
    if (sameMonth) {
      if (isDemoRetailer) {
        return `${monthFmt.format(s)} ${String(s.getDate()).padStart(2, '0')}–${String(e.getDate()).padStart(2, '0')}`
      }
      return `${monthFmt.format(s)} ${String(s.getDate()).padStart(2, '0')}–${String(e.getDate()).padStart(2, '0')} ${yearFmt.format(s)}`
    }
    const fmt = (d: Date) =>
      `${monthFmt.format(d)} ${String(d.getDate()).padStart(2, '0')}`
    if (isDemoRetailer) {
      return `${fmt(s)}–${fmt(e)}`
    }
    return `${fmt(s)}–${fmt(e)} ${yearFmt.format(e)}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isReportView ? (
        /* Black ShareView header for report view */
        <div className="bg-black text-white">
          <div className="max-w-[1800px] mx-auto px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">
                  ShareView
                </p>
                <h1 className="text-xl font-semibold text-white">{retailerName}</h1>
                {reportInfo && (
                  <p className="text-sm text-gray-300 mt-0.5">
                    {reportInfo.title ? `${reportInfo.title} · ` : ''}
                    {formatReportDateRange(reportInfo.period_start, reportInfo.period_end)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-[1800px] mx-auto px-6 py-6">
            <p className="text-xs uppercase tracking-wide text-gray-500">ShareView Client Portal</p>
            <div className="flex items-end justify-between">
              <h1 className="text-2xl font-semibold text-gray-900">{retailerName}</h1>
              <PeriodSelector
                availableMonths={availableMonths}
                availableWeeks={availableWeeks}
                isDemoRetailer={isDemoRetailer}
                allowWeekly={activeTab === 'overview'}
                showRangeControls={activeTab === 'overview' || activeTab === 'auctions'}
                unavailablePeriods={unavailablePeriods}
                unavailableTooltip="No data available"
                unavailableTooltipsByPeriod={unavailableTooltipsByPeriod}
              />
            </div>
          </div>
        </div>
      )}

      <ClientTabNavigation activeTab={activeTab} onTabChange={handleTabChange} tabs={tabs} />

      <main className="max-w-[1800px] mx-auto px-6 pt-2 pb-4 border-transparent">
        {activeTab === 'overview' && (
          <OverviewTab
            retailerId={retailerId}
            apiBase={apiBase}
            retailerConfig={{
              ...featuresEnabled,
              insights: getSubTabVisibility('overview').insights,
              market_insights: getSubTabVisibility('overview').marketComparison,
            } as any}
            visibleMetrics={visibleMetrics}
            reportId={reportId}
            reportPeriod={reportPeriod}
            isDemoRetailer={isDemoRetailer}
            onAvailableMonths={handleAvailableMonths}
            onAvailableWeeks={handleAvailableWeeks}
          />
        )}
        {activeTab === 'keywords' && (
          <KeywordsTab
            retailerId={retailerId}
            apiBase={apiBase}
            retailerConfig={{
              ...featuresEnabled,
              insights: getSubTabVisibility('keywords').insights,
              market_insights: getSubTabVisibility('keywords').marketComparison,
              word_analysis: getSubTabVisibility('keywords').wordAnalysis,
            } as any}
            visibleMetrics={visibleMetrics}
            reportId={reportId}
            reportPeriod={reportPeriod}
          />
        )}
        {activeTab === 'categories' && (
          <CategoriesContent
            retailerId={retailerId}
            apiBase={apiBase}
            retailerConfig={{
              insights: getSubTabVisibility('categories').insights,
              market_insights: getSubTabVisibility('categories').marketComparison,
            }}
            visibleMetrics={visibleMetrics}
            reportId={reportId}
          />
        )}
        {activeTab === 'products' && (
          <ProductsContent
            retailerId={retailerId}
            apiBase={apiBase}
            visibleMetrics={visibleMetrics}
            featuresEnabled={featuresEnabled}
            reportsApiUrl={reportsApiUrl}
            reportId={reportId}
            reportPeriod={reportPeriod}
          />
        )}
        {activeTab === 'auctions' && (
          <AuctionsTab
            retailerId={retailerId}
            apiBase={apiBase}
            reportId={reportId}
            reportPeriod={reportPeriod}
            retailerConfig={{
              insights: getSubTabVisibility('auctions').insights,
              market_insights: getSubTabVisibility('auctions').marketComparison,
            }}
            visibleMetrics={visibleMetrics}
            auctionMetricIds={auctionsSelectedMetrics}
            featuresEnabled={featuresEnabled as Record<string, unknown>}
            isDemoRetailer={isDemoRetailer}
          />
        )}
      </main>
    </div>
  )
}
