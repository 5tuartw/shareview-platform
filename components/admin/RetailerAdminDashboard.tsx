'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DateRangeProvider, useDateRange } from '@/lib/contexts/DateRangeContext'
import ClientTabNavigation from '@/components/client/ClientTabNavigation'
import { SubTabNavigation } from '@/components/shared'
import DateRangeSelectorWrapper from '@/components/client/DateRangeSelectorWrapper'
import OverviewTab from '@/components/client/OverviewTab'
import KeywordsTab from '@/components/client/KeywordsTab'
import CategoriesTab from '@/components/client/CategoriesTab'
import ProductsContent from '@/components/client/ProductsContent'
import AuctionsTab from '@/components/client/AuctionsTab'
import SnapshotCreationModal from '@/components/admin/SnapshotCreationModal'
import RetailerReportsPanel from '@/components/admin/RetailerReportsPanel'
import RetailerSettingsPanel from '@/components/admin/RetailerSettingsPanel'
import type { RetailerConfigResponse } from '@/types'

interface RetailerAdminDashboardProps {
    retailerId: string
    retailerName: string
    config: RetailerConfigResponse
    user: { name?: string | null; role?: string }
}

const DEFAULT_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']

// Inner component for snapshot button with modal
function SnapshotButtonWithModal({
    retailerId,
    retailerName,
    activeSection,
    onCreated,
}: {
    retailerId: string
    retailerName: string
    activeSection: string
    onCreated: (reportId: number) => void
}) {
    const { start, end, period } = useDateRange()
    const [showModal, setShowModal] = useState(false)

    // Derive period label from period (YYYY-MM format)
    const periodLabel = useMemo(() => {
        try {
            const date = new Date(period + '-01')
            return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        } catch {
            return period
        }
    }, [period])

    const handleCreated = (reportId: number) => {
        setShowModal(false)
        onCreated(reportId)
    }

    if (activeSection !== 'live') return null

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-md transition-colors"
            >
                Create snapshot report
            </button>
            {showModal && (
                <SnapshotCreationModal
                    retailerId={retailerId}
                    retailerName={retailerName}
                    periodStart={start}
                    periodEnd={end}
                    periodLabel={periodLabel}
                    onClose={() => setShowModal(false)}
                    onCreated={handleCreated}
                />
            )}
        </>
    )
}

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

    const [productsSubTab, setProductsSubTab] = useState('performance')
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

    const handleSnapshotCreated = (reportId: number) => {
        setActiveSection('reports')
    }

    return (
        <DateRangeProvider>
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
                    <SnapshotButtonWithModal
                        retailerId={retailerId}
                        retailerName={retailerName}
                        activeSection={activeSection}
                        onCreated={handleSnapshotCreated}
                    />
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
                    <>
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

                        {/* Tab content */}
                        <main className="max-w-7xl mx-auto px-6 py-6 w-full border-transparent">
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
                    </>
                )}

                {activeSection === 'reports' && (
                    <div className="max-w-7xl mx-auto px-6 py-6 w-full">
                        <div className="mb-6">
                            <h2 className="text-2xl font-semibold text-gray-900">Snapshot Reports</h2>
                            <p className="text-gray-500 text-sm mt-1">Manage historical snapshot reports for this retailer</p>
                        </div>
                        <RetailerReportsPanel retailerId={retailerId} />
                    </div>
                )}
                {activeSection === 'settings' && (
                    <RetailerSettingsPanel retailerId={retailerId} retailerName={retailerName} />
                )}
            </div>
        </div>
        </DateRangeProvider>
    )
}
