'use client'

import { useMemo, useState } from 'react'
import ClientTabNavigation from '@/components/client/ClientTabNavigation'
import { SubTabNavigation } from '@/components/shared'
import OverallContent from '@/components/client/OverallContent'
import KeywordPerformance from '@/components/client/KeywordPerformance'
import CategoriesContent from '@/components/client/CategoriesContent'
import ProductsContent from '@/components/client/ProductsContent'
import AuctionContent from '@/components/client/AuctionContent'
import CoverageTab from '@/components/client/CoverageTab'
import type { RetailerConfigResponse } from '@/types'

interface RetailerClientDashboardProps {
  retailerId: string
  retailerName: string
  config: RetailerConfigResponse
}

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions', 'coverage']

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
      { id: 'coverage', label: 'Coverage' },
    ],
    []
  )

  const tabs = availableTabs.filter((tab) => visibleTabs.includes(tab.id))
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'overview')

  const [overviewSubTab, setOverviewSubTab] = useState('13-weeks')
  const [keywordSubTab, setKeywordSubTab] = useState('keyword-performance')
  const [categorySubTab, setCategorySubTab] = useState('performance')
  const [productsSubTab, setProductsSubTab] = useState('performance')
  const [auctionsSubTab, setAuctionsSubTab] = useState('performance')
  const [selectedMonth, setSelectedMonth] = useState('2025-11')

  const showCompetitorComparison = featuresEnabled.competitor_comparison !== false
  const showMarketInsights = featuresEnabled.market_insights !== false

  const keywordTabs = useMemo(() => {
    const base = [
      { id: 'summary', label: 'Summary' },
      { id: 'keyword-performance', label: 'Performance' },
      { id: 'word-performance', label: 'Word Analysis' },
    ]

    if (showMarketInsights) {
      base.push({ id: 'market-insights', label: 'Market Insights' })
    }

    return base
  }, [showMarketInsights])

  const categoryTabs = useMemo(() => {
    const base = [{ id: 'performance', label: 'Performance' }]

    if (showCompetitorComparison) {
      base.push({ id: 'competitor-comparison', label: 'Competitor Comparison' })
    }

    if (showMarketInsights) {
      base.push({ id: 'market-insights', label: 'Market Insights' })
    }

    return base
  }, [showCompetitorComparison, showMarketInsights])

  const productTabs = useMemo(() => {
    const base = [{ id: 'performance', label: 'Performance' }]

    if (showCompetitorComparison) {
      base.push({ id: 'competitor-comparison', label: 'Competitor Comparison' })
    }

    if (showMarketInsights) {
      base.push({ id: 'market-insights', label: 'Market Insights' })
    }

    return base
  }, [showCompetitorComparison, showMarketInsights])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <p className="text-xs uppercase tracking-wide text-gray-500">ShareView Client Portal</p>
          <h1 className="text-2xl font-semibold text-gray-900">{retailerName}</h1>
        </div>
      </div>

      <ClientTabNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {activeTab === 'overview' && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto">
            <SubTabNavigation
              activeTab={overviewSubTab}
              tabs={[
                { id: '13-weeks', label: '13 Weeks' },
                { id: '13-months', label: '13 Months' },
              ]}
              onTabChange={setOverviewSubTab}
            />
          </div>
        </div>
      )}

      {activeTab === 'keywords' && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto">
            <SubTabNavigation activeTab={keywordSubTab} tabs={keywordTabs} onTabChange={setKeywordSubTab} />
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto">
            <SubTabNavigation activeTab={categorySubTab} tabs={categoryTabs} onTabChange={setCategorySubTab} />
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto">
            <SubTabNavigation activeTab={productsSubTab} tabs={productTabs} onTabChange={setProductsSubTab} />
          </div>
        </div>
      )}

      {activeTab === 'auctions' && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto">
            <SubTabNavigation
              activeTab={auctionsSubTab}
              tabs={[{ id: 'performance', label: 'Performance' }]}
              onTabChange={setAuctionsSubTab}
            />
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'overview' && (
          <OverallContent retailerId={retailerId} activeSubTab={overviewSubTab} visibleMetrics={visibleMetrics} />
        )}
        {activeTab === 'keywords' && (
          <KeywordPerformance
            retailerId={retailerId}
            activeSubTab={keywordSubTab}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            keywordFilters={keywordFilters}
          />
        )}
        {activeTab === 'categories' && (
          <CategoriesContent
            retailerId={retailerId}
            activeSubTab={categorySubTab}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            visibleMetrics={visibleMetrics}
          />
        )}
        {activeTab === 'products' && (
          <ProductsContent
            retailerId={retailerId}
            activeSubTab={productsSubTab}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            visibleMetrics={visibleMetrics}
          />
        )}
        {activeTab === 'auctions' && auctionsSubTab === 'performance' && (
          <AuctionContent retailerId={retailerId} visibleMetrics={visibleMetrics} />
        )}
        {activeTab === 'coverage' && <CoverageTab />}
      </main>
    </div>
  )
}
