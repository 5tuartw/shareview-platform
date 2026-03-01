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
import MonthSelector from '@/components/client/MonthSelector'

interface RetailerClientDashboardProps {
  retailerId: string
  retailerName: string
  config: RetailerConfigResponse
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

export default function RetailerClientDashboard({ retailerId, retailerName, config, apiBase, reportsApiUrl, reportId, reportPeriod, reportInfo }: RetailerClientDashboardProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const visibleTabs = config.visible_tabs?.length ? config.visible_tabs : DEFAULT_TABS
  const visibleMetrics = config.visible_metrics || []
  const featuresEnabled = config.features_enabled || {}
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

  const tabs = availableTabs.filter((tab) => visibleTabs.includes(tab.id))
  
  // Read main tab from URL params
  const mainTabParam = searchParams.get('tab')
  const initialTab = mainTabParam && tabs.find(t => t.id === mainTabParam) ? mainTabParam : tabs[0]?.id || 'overview'
  const [activeTab, setActiveTab] = useState(initialTab)

  // Sync activeTab with URL params
  useEffect(() => {
    const urlTab = searchParams.get('tab')
    if (urlTab && urlTab !== activeTab && tabs.find(t => t.id === urlTab)) {
      setActiveTab(urlTab)
    }
  }, [searchParams, activeTab, tabs])

  // Update URL when tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    if (!isReportView) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tabId)
      router.replace(`?${params.toString()}`)
    }
  }

  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const handleAvailableMonths = (months: string[]) => setAvailableMonths(months)

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



  const formatReportDateRange = (start: string, end: string) => {
    const s = new Date(start)
    const e = new Date(end)
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
    const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long' })
    const yearFmt = new Intl.DateTimeFormat('en-GB', { year: 'numeric' })
    if (sameMonth) {
      return `${monthFmt.format(s)} ${String(s.getDate()).padStart(2, '0')}–${String(e.getDate()).padStart(2, '0')} ${yearFmt.format(s)}`
    }
    const fmt = (d: Date) =>
      `${monthFmt.format(d)} ${String(d.getDate()).padStart(2, '0')}`
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
              <MonthSelector availableMonths={availableMonths} />
            </div>
          </div>
        </div>
      )}

      <ClientTabNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      <main className="max-w-[1800px] mx-auto px-6 py-4 border-transparent">
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
            onAvailableMonths={handleAvailableMonths}
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
            reportId={reportId}
            reportPeriod={reportPeriod}
            retailerConfig={{
              insights: getSubTabVisibility('auctions').insights,
              market_insights: getSubTabVisibility('auctions').marketComparison,
            }}
            visibleMetrics={visibleMetrics}
          />
        )}
      </main>
    </div>
  )
}
