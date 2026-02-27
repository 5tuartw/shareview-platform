'use client'

import { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { ChevronDown, LogOut } from 'lucide-react'
import { DateRangeProvider } from '@/lib/contexts/DateRangeContext'
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
    periodStart,
    periodEnd,
    period,
    periodType,
    onCreated,
}: {
    retailerId: string
    retailerName: string
    periodStart: string
    periodEnd: string
    period: string
    periodType: string
    onCreated: (reportId: number) => void
}) {
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
                    periodStart={periodStart}
                    periodEnd={periodEnd}
                    periodLabel={periodLabel}
                    periodType={periodType}
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
    const searchParams = useSearchParams()
    
    // Derive active section from URL params (single source of truth)
    const sectionParam = searchParams.get('section') as 'live' | 'reports' | 'settings' | null
    const activeSection = sectionParam && ['live', 'reports', 'settings'].includes(sectionParam) ? sectionParam : 'live'
    
    const handleSectionChange = (section: 'live' | 'reports' | 'settings') => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('section', section)
        router.replace(`?${params.toString()}`, { scroll: false })
    }

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
    const [showUserMenu, setShowUserMenu] = useState(false)

    const getRoleDisplay = (role?: string) => {
        const roleMap: Record<string, string> = {
            'SALES_TEAM': 'Sales Team',
            'CSS_ADMIN': 'CSS Admin',
        }
        return role ? (roleMap[role] || role) : ''
    }

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
        handleSectionChange('reports')
    }

    // Get current date range from URL params for snapshot button
    const currentPeriod = searchParams.get('period') || '2026-02'
    const currentPeriodType = searchParams.get('periodType') || 'month'
    
    // Calculate start and end dates if not provided
    const getMonthStart = (period: string) => {
        return period + '-01'
    }
    const getMonthEnd = (period: string) => {
        const [year, month] = period.split('-').map(Number)
        const lastDay = new Date(year, month, 0).getDate()
        return `${period}-${String(lastDay).padStart(2, '0')}`
    }
    
    const currentStart = searchParams.get('start') || getMonthStart(currentPeriod)
    const currentEnd = searchParams.get('end') || getMonthEnd(currentPeriod)

    return (

        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Top bar (persistent, dark #1C1D1C background) */}
            <div className="bg-[#1C1D1C] text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Image src="/img/shareview_logo.png" alt="ShareView" width={160} height={40} className="h-10 w-auto object-contain" />
                    <div className="h-6 w-px bg-gray-700" />
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
                    <div className="relative">
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="flex items-center gap-2 px-3 py-2 rounded-md text-white hover:bg-white/10 transition-colors"
                        >
                            <div className="text-right">
                                <p className="text-sm font-medium">{user.name}</p>
                                <p className="text-xs text-gray-400">{getRoleDisplay(user.role)}</p>
                            </div>
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        {showUserMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                                    <button
                                        onClick={() => signOut({ callbackUrl: '/login' })}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sign Out
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Section navigation bar */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-[1800px] mx-auto px-6">
                    <div className="flex space-x-8">
                        {(['live', 'reports', 'settings'] as const).map((section) => (
                            <button
                                key={section}
                                onClick={() => handleSectionChange(section)}
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
                    <>
                        <div className="bg-white border-b border-gray-200 px-6 py-6">
                            <div className="max-w-[1800px] px-6 mx-auto flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-semibold text-gray-900">Live Data</h2>
                                    <p className="text-gray-500 text-sm mt-1">Real-time performance metrics</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <DateRangeSelectorWrapper />
                                    <SnapshotButtonWithModal
                                        retailerId={retailerId}
                                        retailerName={retailerName}
                                        periodStart={currentStart}
                                        periodEnd={currentEnd}
                                        period={currentPeriod}
                                        periodType={currentPeriodType}
                                        onCreated={handleSnapshotCreated}
                                    />
                                </div>
                            </div>
                        </div>

                        <ClientTabNavigation
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            tabs={availableTabs}
                        />

                        {activeTab === 'products' && (
                            <div className="bg-white border-b">
                                <div className="max-w-[1800px] mx-auto">
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
                        <main className="max-w-[1800px] mx-auto px-6 py-6 w-full border-transparent">
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
                    </DateRangeProvider>
                )}

                {activeSection === 'reports' && (
                    <div className="max-w-[1800px] mx-auto px-6 py-6 w-full">
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
    )
}
