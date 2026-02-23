'use client'

import { useMemo, useState } from 'react'
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
}

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']

export default function RetailerClientDashboard({ retailerId, retailerName, config }: RetailerClientDashboardProps) {
  const visibleTabs = config.visible_tabs?.length ? config.visible_tabs : DEFAULT_TABS
  const visibleMetrics = config.visible_metrics || []
  const featuresEnabled = config.features_enabled || {}
  const keywordFilters = config.keyword_filters || []

  const availableTabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'keywords', label: 'Keywords' },
      { id: 'categories', label: 'Categories' },
      { id: 'products', label: 'Products' },
      { id: 'auctions', label: 'Auctions' },
    ],
    []
  )

  const tabs = availableTabs.filter((tab) => visibleTabs.includes(tab.id))
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'overview')

  const [productsSubTab, setProductsSubTab] = useState('performance')
  const [selectedMonth, setSelectedMonth] = useState('2026-02')

  const showCompetitorComparison = featuresEnabled.competitor_comparison !== false
  const showMarketInsights = featuresEnabled.market_insights !== false
  const showReportsTab = featuresEnabled.show_reports_tab === true



  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <p className="text-xs uppercase tracking-wide text-gray-500">ShareView Client Portal</p>
          <h1 className="text-2xl font-semibold text-gray-900">{retailerName}</h1>
        </div>
      </div>

      <ClientTabNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {activeTab === 'products' && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto">
            <SubTabNavigation activeTab={productsSubTab} tabs={[
              { id: 'performance', label: 'Performance' },
              ...(showCompetitorComparison ? [{ id: 'competitor-comparison', label: 'Competitor Comparison' }] : []),
              ...(showMarketInsights ? [{ id: 'market-insights', label: 'Market Insights' }] : []),
              ...(showReportsTab ? [{ id: 'reports', label: 'Reports' }] : [])
            ]} onTabChange={setProductsSubTab} />
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6 border-transparent">
        {activeTab === 'overview' && <OverviewTab retailerId={retailerId} retailerConfig={featuresEnabled as any} />}
        {activeTab === 'keywords' && <KeywordsTab retailerId={retailerId} retailerConfig={featuresEnabled as any} />}
        {activeTab === 'categories' && <CategoriesTab retailerId={retailerId} retailerConfig={featuresEnabled as any} />}
        {activeTab === 'products' && (
          <ProductsContent
            retailerId={retailerId}
            activeSubTab={productsSubTab}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            visibleMetrics={visibleMetrics}
            featuresEnabled={featuresEnabled}
          />
        )}
        {activeTab === 'auctions' && <AuctionsTab />}
      </main>
    </div>
  )
}
