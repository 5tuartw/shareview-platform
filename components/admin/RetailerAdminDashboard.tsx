'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DateRangeProvider } from '@/lib/contexts/DateRangeContext'
import ClientTabNavigation from '@/components/client/ClientTabNavigation'
import { SubTabNavigation } from '@/components/shared'
import DateRangeSelectorWrapper from '@/components/client/DateRangeSelectorWrapper'
import OverallContent from '@/components/client/OverallContent'
import KeywordPerformance from '@/components/client/KeywordPerformance'
import CategoriesContent from '@/components/client/CategoriesContent'
import ProductsContent from '@/components/client/ProductsContent'
import AuctionContent from '@/components/client/AuctionContent'
import ReportsSubTab from '@/components/client/ReportsSubTab'
import type { RetailerConfigResponse } from '@/types'

interface RetailerAdminDashboardProps {
    retailerId: string
    retailerName: string
    config: RetailerConfigResponse
    user: { name?: string | null; role?: string }
}

const DEFAULT_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']

export default function RetailerAdminDashboard({
    retailerId,
    retailerName,
    config,
    user,
}: RetailerAdminDashboardProps) {
    const router = useRouter()
    const [activeSection, setActiveSection] = useState<'live' | 'reports' | 'settings'>('live')

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

    const [activeTab, setActiveTab] = useState(availableTabs[0].id)

    const [overviewSubTab, setOverviewSubTab] = useState('13-weeks')
    const [keywordSubTab, setKeywordSubTab] = useState('keyword-performance')
    const [categorySubTab, setCategorySubTab] = useState('performance')
    const [productsSubTab, setProductsSubTab] = useState('performance')
    const [auctionsSubTab, setAuctionsSubTab] = useState('performance')
    const [selectedMonth, setSelectedMonth] = useState('2026-02')

    const visibleMetrics = DEFAULT_METRICS
    const keywordFilters: any[] = []

    // All features enabled for staff
    const featuresEnabled = {
        ...config.features_enabled,
        insights: true,
        competitor_comparison: true,
        market_insights: true,
        show_reports_tab: true,
    }

    const showReportsTab = featuresEnabled.show_reports_tab === true
    const showCompetitorComparison = featuresEnabled.competitor_comparison === true
    const showMarketInsights = featuresEnabled.market_insights === true

    const overviewTabs = useMemo(() => {
        const base = [
            { id: '13-weeks', label: '13 Weeks' },
            { id: '13-months', label: '13 Months' },
        ]
        if (showReportsTab) {
            base.push({ id: 'reports', label: 'Reports' })
        }
        return base
    }, [showReportsTab])

    const keywordTabs = useMemo(() => {
        const base = [
            { id: 'summary', label: 'Summary' },
            { id: 'keyword-performance', label: 'Performance' },
            { id: 'word-performance', label: 'Word Analysis' },
        ]

        if (showReportsTab) {
            base.push({ id: 'reports', label: 'Reports' })
        }

        return base
    }, [showReportsTab])

    const categoryTabs = useMemo(() => {
        const base = [{ id: 'performance', label: 'Performance' }]

        if (showCompetitorComparison) {
            base.push({ id: 'competitor-comparison', label: 'Competitor Comparison' })
        }

        if (showReportsTab) {
            base.push({ id: 'reports', label: 'Reports' })
        }

        return base
    }, [showCompetitorComparison, showReportsTab])

    const productTabs = useMemo(() => {
        const base = [{ id: 'performance', label: 'Performance' }]

        if (showCompetitorComparison) {
            base.push({ id: 'competitor-comparison', label: 'Competitor Comparison' })
        }

        if (showMarketInsights) {
            base.push({ id: 'market-insights', label: 'Market Insights' })
        }

        if (showReportsTab) {
            base.push({ id: 'reports', label: 'Reports' })
        }

        return base
    }, [showCompetitorComparison, showMarketInsights, showReportsTab])

    const auctionTabs = useMemo(() => {
        const base = [{ id: 'performance', label: 'Performance' }]
        if (showReportsTab) {
            base.push({ id: 'reports', label: 'Reports' })
        }
        return base
    }, [showReportsTab])

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Top bar (persistent, dark #1C1D1C background) */}
            <div className="bg-[#1C1D1C] text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-gray-300 hover:text-white text-sm"
                    >
                        &larr; All retailers
                    </button>
                    <div className="h-6 w-px bg-gray-700" />
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-semibold">{retailerName}</h1>
                        <span className="px-2 py-1 text-xs font-medium bg-gray-800 text-gray-300 rounded-full">
                            Admin
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        disabled
                        className="px-4 py-2 text-sm font-medium border border-gray-600 rounded-md text-gray-400 cursor-not-allowed"
                    >
                        Retailer link
                    </button>
                    {activeSection === 'live' && (
                        <button className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-md transition-colors">
                            Create snapshot report
                        </button>
                    )}
                </div>
            </div>

            {/* Section navigation bar */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex space-x-8">
                        {(['live', 'reports', 'settings'] as const).map((section) => (
                            <button
                                key={section}
                                onClick={() => setActiveSection(section)}
                                className={`py-4 text-sm font-medium capitalize border-b-2 transition-colors ${activeSection === section
                                    ? 'border-[#1C1D1C] text-gray-900'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                {section === 'live' ? 'Live Data' : section}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section Content */}
            <div className="flex-1 flex flex-col">
                {activeSection === 'live' && (
                    <DateRangeProvider>
                        <div className="bg-white border-b border-gray-200 px-6 py-6">
                            <div className="max-w-7xl mx-auto flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-semibold text-gray-900">Live Data</h2>
                                    <p className="text-gray-500 text-sm mt-1">Real-time performance metrics</p>
                                </div>
                                <DateRangeSelectorWrapper />
                            </div>
                        </div>

                        <ClientTabNavigation
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            tabs={availableTabs}
                        />

                        {/* Sub-tab navs */}
                        {activeTab === 'overview' && (
                            <div className="bg-white border-b">
                                <div className="max-w-7xl mx-auto">
                                    <SubTabNavigation
                                        activeTab={overviewSubTab}
                                        tabs={overviewTabs}
                                        onTabChange={setOverviewSubTab}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'keywords' && (
                            <div className="bg-white border-b">
                                <div className="max-w-7xl mx-auto">
                                    <SubTabNavigation
                                        activeTab={keywordSubTab}
                                        tabs={keywordTabs}
                                        onTabChange={setKeywordSubTab}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'categories' && (
                            <div className="bg-white border-b">
                                <div className="max-w-7xl mx-auto">
                                    <SubTabNavigation
                                        activeTab={categorySubTab}
                                        tabs={categoryTabs}
                                        onTabChange={setCategorySubTab}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'products' && (
                            <div className="bg-white border-b">
                                <div className="max-w-7xl mx-auto">
                                    <SubTabNavigation
                                        activeTab={productsSubTab}
                                        tabs={productTabs}
                                        onTabChange={setProductsSubTab}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'auctions' && (
                            <div className="bg-white border-b">
                                <div className="max-w-7xl mx-auto">
                                    <SubTabNavigation
                                        activeTab={auctionsSubTab}
                                        tabs={auctionTabs}
                                        onTabChange={setAuctionsSubTab}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Tab content */}
                        <main className="max-w-7xl mx-auto px-6 py-6 w-full">
                            {activeTab === 'overview' && overviewSubTab !== 'reports' && (
                                <OverallContent
                                    retailerId={retailerId}
                                    activeSubTab={overviewSubTab}
                                    visibleMetrics={visibleMetrics}
                                    featuresEnabled={featuresEnabled}
                                />
                            )}
                            {activeTab === 'overview' && overviewSubTab === 'reports' && (
                                <ReportsSubTab retailerId={retailerId} domain="overview" featuresEnabled={featuresEnabled} />
                            )}

                            {activeTab === 'keywords' && keywordSubTab !== 'reports' && (
                                <KeywordPerformance
                                    retailerId={retailerId}
                                    activeSubTab={keywordSubTab}
                                    selectedMonth={selectedMonth}
                                    onMonthChange={setSelectedMonth}
                                    keywordFilters={keywordFilters}
                                    featuresEnabled={featuresEnabled}
                                />
                            )}
                            {activeTab === 'keywords' && keywordSubTab === 'reports' && (
                                <ReportsSubTab retailerId={retailerId} domain="keywords" featuresEnabled={featuresEnabled} />
                            )}

                            {activeTab === 'categories' && categorySubTab !== 'reports' && (
                                <CategoriesContent
                                    retailerId={retailerId}
                                    activeSubTab={categorySubTab}
                                    visibleMetrics={visibleMetrics}
                                    featuresEnabled={featuresEnabled}
                                />
                            )}
                            {activeTab === 'categories' && categorySubTab === 'reports' && (
                                <ReportsSubTab retailerId={retailerId} domain="categories" featuresEnabled={featuresEnabled} />
                            )}

                            {activeTab === 'products' && productsSubTab !== 'reports' && (
                                <ProductsContent
                                    retailerId={retailerId}
                                    activeSubTab={productsSubTab}
                                    selectedMonth={selectedMonth}
                                    onMonthChange={setSelectedMonth}
                                    visibleMetrics={visibleMetrics}
                                    featuresEnabled={featuresEnabled}
                                />
                            )}
                            {activeTab === 'products' && productsSubTab === 'reports' && (
                                <ReportsSubTab retailerId={retailerId} domain="products" featuresEnabled={featuresEnabled} />
                            )}

                            {activeTab === 'auctions' && auctionsSubTab !== 'reports' && (
                                <AuctionContent
                                    retailerId={retailerId}
                                    visibleMetrics={visibleMetrics}
                                    featuresEnabled={featuresEnabled}
                                />
                            )}
                            {activeTab === 'auctions' && auctionsSubTab === 'reports' && (
                                <ReportsSubTab retailerId={retailerId} domain="auctions" featuresEnabled={featuresEnabled} />
                            )}
                        </main>
                    </DateRangeProvider>
                )}

                {activeSection === 'reports' && (
                    <div className="max-w-7xl mx-auto px-6 py-12 text-center text-gray-500 w-full">
                        Reports section — coming soon
                    </div>
                )}
                {activeSection === 'settings' && (
                    <div className="max-w-7xl mx-auto px-6 py-12 text-center text-gray-500 w-full">
                        Settings section — coming soon
                    </div>
                )}
            </div>
        </div>
    )
}
