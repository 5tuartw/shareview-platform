'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ClientTabNavigation from '@/components/client/ClientTabNavigation'
import { SubTabNavigation } from '@/components/shared'
import OverviewTab from '@/components/client/OverviewTab'
import KeywordsTab from '@/components/client/KeywordsTab'
import CategoriesTab from '@/components/client/CategoriesTab'
import ProductsContent from '@/components/client/ProductsContent'
import AuctionsTab from '@/components/client/AuctionsTab'
import type { RetailerConfigResponse } from '@/types'

interface RetailerClientDashboardProps {
  retailerId: string
  retailerName: string
  config: RetailerConfigResponse
  reportsApiUrl?: string
  reportId?: number
  reportPeriod?: {
    start: string
    end: string
    type: string
  }
}

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']

export default function RetailerClientDashboard({ retailerId, retailerName, config, reportsApiUrl, reportId, reportPeriod }: RetailerClientDashboardProps) {
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

  // Read products sub-tab from URL params
  const productsSubTabParam = searchParams.get('productsSubTab')
  const initialProductsSubTab = productsSubTabParam || 'performance'
  const [productsSubTab, setProductsSubTab] = useState(initialProductsSubTab)

  // Sync activeTab with URL params
  useEffect(() => {
    const urlTab = searchParams.get('tab')
    if (urlTab && urlTab !== activeTab && tabs.find(t => t.id === urlTab)) {
      setActiveTab(urlTab)
    }
    
    const urlProductsSubTab = searchParams.get('productsSubTab')
    if (urlProductsSubTab && urlProductsSubTab !== productsSubTab) {
      setProductsSubTab(urlProductsSubTab)
    }
  }, [searchParams, activeTab, productsSubTab, tabs])

  // Update URL when tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    if (!isReportView) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tabId)
      router.replace(`?${params.toString()}`)
    }
  }

  // Update URL when products sub-tab changes
  const handleProductsSubTabChange = (subTabId: string) => {
    setProductsSubTab(subTabId)
    if (!isReportView) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('productsSubTab', subTabId)
      router.replace(`?${params.toString()}`)
    }
  }

  const [selectedMonth, setSelectedMonth] = useState('2026-02')

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



  return (
    <div className="min-h-screen bg-gray-50">
      {!isReportView && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-[1800px] mx-auto px-6 py-6">
            <p className="text-xs uppercase tracking-wide text-gray-500">ShareView Client Portal</p>
            <h1 className="text-2xl font-semibold text-gray-900">{retailerName}</h1>
          </div>
        </div>
      )}

      <ClientTabNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {activeTab === 'products' && (
        <div className="bg-white border-b">
          <div className="max-w-[1800px] mx-auto">
            <SubTabNavigation activeTab={productsSubTab} tabs={[
              { id: 'performance', label: 'Performance' },
              ...(getSubTabVisibility('products').marketComparison ? [{ id: 'market-comparison', label: 'Market Comparison' }] : []),
              ...(getSubTabVisibility('products').insights ? [{ id: 'insights', label: 'Insights' }] : []),
              ...(showReportsTab ? [{ id: 'reports', label: 'Reports' }] : [])
            ]} onTabChange={handleProductsSubTabChange} />
          </div>
        </div>
      )}

      <main className="max-w-[1800px] mx-auto px-6 py-6 border-transparent">
        {activeTab === 'overview' && (
          <OverviewTab
            retailerId={retailerId}
            retailerConfig={{
              insights: getSubTabVisibility('overview').insights,
              market_insights: getSubTabVisibility('overview').marketComparison,
              ...featuresEnabled
            } as any}
            reportId={reportId}
            reportPeriod={reportPeriod}
          />
        )}
        {activeTab === 'keywords' && (
          <KeywordsTab
            retailerId={retailerId}
            retailerConfig={{
              insights: getSubTabVisibility('keywords').insights,
              market_insights: getSubTabVisibility('keywords').marketComparison,
              ...featuresEnabled
            } as any}
            reportId={reportId}
            reportPeriod={reportPeriod}
          />
        )}
        {activeTab === 'categories' && (
          <CategoriesTab
            retailerId={retailerId}
            retailerConfig={{
              insights: getSubTabVisibility('categories').insights,
              market_insights: getSubTabVisibility('categories').marketComparison,
              ...featuresEnabled
            } as any}
            reportId={reportId}
            reportPeriod={reportPeriod}
          />
        )}
        {activeTab === 'products' && (
          <ProductsContent
            retailerId={retailerId}
            activeSubTab={productsSubTab}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            visibleMetrics={visibleMetrics}
            featuresEnabled={featuresEnabled}
            reportsApiUrl={reportsApiUrl}
            reportId={reportId}
            reportPeriod={reportPeriod}
          />
        )}
        {activeTab === 'auctions' && (
          <AuctionsTab retailerId={retailerId} reportId={reportId} reportPeriod={reportPeriod} />
        )}
      </main>
    </div>
  )
}
