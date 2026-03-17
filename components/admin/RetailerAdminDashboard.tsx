'use client'

import { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { ChevronDown, LogOut } from 'lucide-react'
import { DateRangeProvider } from '@/lib/contexts/DateRangeContext'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import ClientTabNavigation from '@/components/client/ClientTabNavigation'
import { SubTabNavigation } from '@/components/shared'
import PeriodSelector from '@/components/client/PeriodSelector'
import type { AvailableMonth } from '@/lib/analytics-utils'
import OverviewTab from '@/components/client/OverviewTab'
import KeywordsTab from '@/components/client/KeywordsTab'
import CategoriesContent from '@/components/client/CategoriesContent'
import ProductsContent from '@/components/client/ProductsContent'
import AuctionsTab from '@/components/client/AuctionsTab'
import SnapshotCreationModal from '@/components/admin/SnapshotCreationModal'
import RetailerReportsPanel from '@/components/admin/RetailerReportsPanel'
import RetailerSettingsPanel from '@/components/admin/RetailerSettingsPanel'
import type { RetailerConfigResponse } from '@/types'

type AvailabilityDomain = 'overview' | 'keywords' | 'categories' | 'products' | 'auctions'

interface AvailabilityMeta {
    auctions?: {
        months_with_any_data?: string[]
        months_displayable?: string[]
        latest_displayable_month?: string | null
    }
}

interface RetailerAdminDashboardProps {
    retailerId: string
    retailerName: string
    config: RetailerConfigResponse
    user: { name?: string | null; role?: string }
}

const DEFAULT_METRICS = ['gmv', 'commission', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'profit', 'validation_rate']

// Inner component for snapshot button with modal
function SnapshotButtonWithModal({
    retailerId,
    retailerName,
    periodStart,
    periodEnd,
    period,
    periodType,
    defaultDomains,
    onCreated,
    activeTab,
}: {
    retailerId: string
    retailerName: string
    periodStart: string
    periodEnd: string
    period: string
    periodType: string
    defaultDomains?: string[]
    onCreated: (reportId: number) => void
    activeTab: string
}) {
    const [showModal, setShowModal] = useState(false)
    const { period: selectedMonth, overviewView, windowSize, weekPeriod } = useDateRange()

    const toMonthLabel = (month: string): string => {
        const parsed = new Date(`${month}-01T00:00:00Z`)
        if (Number.isNaN(parsed.getTime())) return month
        return parsed.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    }

    const toWeekLabel = (week: string): string => {
        const parsed = new Date(`${week.slice(0, 10)}T00:00:00Z`)
        if (Number.isNaN(parsed.getTime())) return week
        return `w/c ${parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    }

    const monthLabelForSummary = toMonthLabel(selectedMonth || period)
    const selectedPeriodSummary =
        activeTab === 'overview' && overviewView === 'weekly' && weekPeriod
            ? `${monthLabelForSummary} (Overview only: ${toWeekLabel(weekPeriod)})`
            : monthLabelForSummary

    const lookbackUnit = overviewView === 'weekly' ? 'week' : 'month'
    const lookbackSummary = `${windowSize} ${lookbackUnit}${windowSize === 1 ? '' : 's'}`

    const overviewSnapshotConfig = {
        view_type: overviewView,
        month_period: selectedMonth || period,
        ...(overviewView === 'weekly' && weekPeriod ? { week_period: weekPeriod } : {}),
        monthly_window: overviewView === 'monthly' ? windowSize : 12,
        weekly_window: overviewView === 'weekly' ? windowSize : 13,
    } as const

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
                className="h-[64px] min-w-[170px] px-4 text-base leading-tight font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-md transition-colors text-center"
            >
                Create snapshot
                <br />
                report
            </button>
            {showModal && (
                <SnapshotCreationModal
                    retailerId={retailerId}
                    retailerName={retailerName}
                    periodStart={periodStart}
                    periodEnd={periodEnd}
                    periodLabel={periodLabel}
                    periodType={periodType}
                    selectedPeriodSummary={selectedPeriodSummary}
                    lookbackSummary={lookbackSummary}
                    overviewSnapshotConfig={overviewSnapshotConfig}
                    defaultDomains={defaultDomains}
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
    const searchParamsString = searchParams.toString()
    
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

    const deriveTabFromParams = (params: URLSearchParams) => {
        const tabParam = params.get('tab')
        if (tabParam && availableTabs.some((tab) => tab.id === tabParam)) {
            return tabParam
        }

        // Legacy support: older URLs stored the main tab in `subTab`.
        const legacySubTab = params.get('subTab')
        if (legacySubTab && availableTabs.some((tab) => tab.id === legacySubTab)) {
            return legacySubTab
        }

        // Heuristic fallback when only a domain sub-tab is present.
        if (params.get('searchTermsSubTab')) return 'keywords'
        if (params.get('productsSubTab')) return 'products'

        return availableTabs[0].id
    }

    const activeTab = useMemo(
        () => deriveTabFromParams(new URLSearchParams(searchParamsString)),
        [searchParamsString, availableTabs]
    )
    const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([])
    const [availableWeeks, setAvailableWeeks] = useState<{ period: string; label: string }[]>([])
    const handleAvailableMonths = (months: AvailableMonth[]) => setAvailableMonths(months)
    const handleAvailableWeeks = (weeks: { period: string; label: string }[]) => setAvailableWeeks(weeks)
    const [availableMonthsByDomain, setAvailableMonthsByDomain] = useState<Record<AvailabilityDomain, AvailableMonth[]>>({
        overview: [],
        keywords: [],
        categories: [],
        products: [],
        auctions: [],
    })
    const [availabilityMeta, setAvailabilityMeta] = useState<AvailabilityMeta>({})


    const [showUserMenu, setShowUserMenu] = useState(false)

    useEffect(() => {
        let cancelled = false

        const loadPeriodAvailability = async () => {
            try {
                const response = await fetch(`/api/retailers/${retailerId}/period-availability`, {
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
                // Keep existing fallback behaviour when preload fails.
            }
        }

        loadPeriodAvailability()

        return () => {
            cancelled = true
        }
    }, [retailerId])

    const handleTabChange = (tabId: string) => {
        const params = new URLSearchParams(searchParamsString)
        params.set('tab', tabId)

        // Avoid stale sub-tab params pulling tab inference back to a previous domain.
        if (tabId !== 'products') params.delete('productsSubTab')
        if (tabId !== 'keywords') params.delete('searchTermsSubTab')
        if (tabId !== 'overview') params.delete('subTab')

        router.replace(`?${params.toString()}`, { scroll: false })
    }

    const getRoleDisplay = (role?: string) => {
        const roleMap: Record<string, string> = {
            'SALES_TEAM': 'Staff',
            'CSS_ADMIN': 'Super Admin',
        }
        return role ? (roleMap[role] || role) : ''
    }

    const visibleMetrics = config.visible_metrics?.length ? config.visible_metrics : DEFAULT_METRICS

    // All features enabled for staff
    const featuresEnabled = {
        ...config.features_enabled,
        show_reports_tab: true,
    }
    const rawFeaturesEnabled = config.features_enabled as unknown as Record<string, unknown>

    const showReportsTab = featuresEnabled.show_reports_tab === true

    const unavailablePeriods = useMemo(() => {
        const domain = activeTab as AvailabilityDomain
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
    }, [activeTab, unavailablePeriods, availabilityMeta])

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
            <div className="bg-[#1C1D1C] text-white py-4">
              <div className="max-w-[1800px] mx-auto px-6 flex items-center justify-between">
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
                        <div className="bg-white border-b border-gray-200 py-4">
                            <div className="max-w-[1800px] px-6 mx-auto flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-semibold text-gray-900">Live Data</h2>
                                    <p className="text-gray-500 text-sm mt-1">Real-time performance metrics</p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-start gap-4 w-full justify-end">
                                        <div className="flex-1 max-w-[900px]">
                                            <PeriodSelector
                                                availableMonths={availableMonths}
                                                availableWeeks={availableWeeks}
                                                isDemoRetailer={config.is_demo === true}
                                                allowWeekly={activeTab === 'overview'}
                                                showRangeControls={activeTab === 'overview'}
                                                unavailablePeriods={unavailablePeriods}
                                                unavailableTooltip="No data available"
                                                unavailableTooltipsByPeriod={unavailableTooltipsByPeriod}
                                            />
                                        </div>
                                        <SnapshotButtonWithModal
                                            retailerId={retailerId}
                                            retailerName={retailerName}
                                            periodStart={currentStart}
                                            periodEnd={currentEnd}
                                            period={currentPeriod}
                                            periodType={currentPeriodType}
                                            defaultDomains={config.visible_tabs}
                                            onCreated={handleSnapshotCreated}
                                            activeTab={activeTab}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <ClientTabNavigation
                            activeTab={activeTab}
                            onTabChange={handleTabChange}
                            tabs={availableTabs}
                        />

{/* Tab content */}
                        <main className="max-w-[1800px] mx-auto px-6 pt-2 pb-6 w-full border-transparent">
                            {activeTab === 'overview' && (
                                <OverviewTab
                                    retailerId={retailerId}
                                    isDemoRetailer={config.is_demo === true}
                                    retailerConfig={featuresEnabled as any}
                                    visibleMetrics={visibleMetrics}
                                    isAdminView={true}
                                    onAvailableMonths={handleAvailableMonths}
                                    onAvailableWeeks={handleAvailableWeeks}
                                />
                            )}
                            {activeTab === 'keywords' && (
                                <KeywordsTab
                                    retailerId={retailerId}
                                    retailerConfig={featuresEnabled as any}
                                    visibleMetrics={visibleMetrics}
                                    isAdminView={true}
                                />
                            )}
                            {activeTab === 'categories' && (
                                <CategoriesContent
                                    retailerId={retailerId}
                                    retailerConfig={featuresEnabled as any}
                                    visibleMetrics={visibleMetrics}
                                    featuresEnabled={featuresEnabled}
                                    isAdminView={true}
                                />
                            )}

                            {activeTab === 'products' && (
                                <ProductsContent
                                    retailerId={retailerId}
                                    visibleMetrics={visibleMetrics}
                                    featuresEnabled={featuresEnabled}
                                    isAdminView={true}
                                />
                            )}

                            {activeTab === 'auctions' && (
                                <AuctionsTab
                                    retailerId={retailerId}
                                    isDemoRetailer={config.is_demo === true}
                                    retailerConfig={featuresEnabled as any}
                                    visibleMetrics={visibleMetrics}
                                    auctionMetricIds={Array.isArray(rawFeaturesEnabled.auctions_selected_metrics) ? (rawFeaturesEnabled.auctions_selected_metrics as string[]) : undefined}
                                    featuresEnabled={rawFeaturesEnabled}
                                    isAdmin={true}
                                />
                            )}
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
                    <RetailerSettingsPanel retailerId={retailerId} retailerName={retailerName} initialSubTab={searchParams.get('sub') ?? undefined} />
                )}
            </div>
        </div>
    )
}
