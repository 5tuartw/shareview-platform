'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import ClientDropdown from '@/components/client/ClientDropdown'
import ViewingToggle from '@/components/client/ViewingToggle'
import TabNavigation from '@/components/client/TabNavigation'
import StaffActionsBar from '@/components/client/StaffActionsBar'
import AdminModal from '@/components/client/AdminModal'
import AccountManagement from '@/components/client/AccountManagement'
import AccountOptions from '@/components/client/AccountOptions'
import OverviewTab from '@/components/client/OverviewTab'
import DateRangeSelectorWrapper from '@/components/client/DateRangeSelectorWrapper'
import KeywordsTab from '@/components/client/KeywordsTab'
import CategoriesTab from '@/components/client/CategoriesTab'
import ProductsTab from '@/components/client/ProductsTab'
import AuctionsTab from '@/components/client/AuctionsTab'
import type { RetailerListItem } from '@/types'

interface ClientDashboardPageProps {
  retailerId: string
}

interface RetailerDetails {
  retailer_id: string
  retailer_name: string
  status?: string
  category?: string
  tier?: string
  account_manager?: string
  logo_url?: string
}

export default function ClientDashboardPage({ retailerId }: ClientDashboardPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const [activeTab, setActiveTab] = useState('overview')
  const [retailer, setRetailer] = useState<RetailerDetails | null>(null)
  const [retailers, setRetailers] = useState<RetailerListItem[]>([])
  const [retailerConfig, setRetailerConfig] = useState({ insights: true, market_insights: true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ status?: number; message: string } | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)

  const viewAsClientParam = searchParams.get('viewAsClient') === '1'
  const [isViewingAsClient, setIsViewingAsClient] = useState(viewAsClientParam)
  const [showAccountManagement, setShowAccountManagement] = useState(false)
  const [showAccountOptions, setShowAccountOptions] = useState(false)
  const [showManageInsights, setShowManageInsights] = useState(false)
  const [showReportPrompts, setShowReportPrompts] = useState(false)

  useEffect(() => {
    setIsViewingAsClient(viewAsClientParam)
  }, [viewAsClientParam])

  const fetchRetailerData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [retailerResponse, retailersResponse, configResponse] = await Promise.all([
        fetch(`/api/retailers/${retailerId}`),
        fetch('/api/retailers'),
        fetch(`/api/config/${retailerId}`),
      ])

      if (!retailerResponse.ok) {
        const errorPayload = await retailerResponse.json().catch(() => ({ error: 'Unable to load retailer.' }))
        setError({ status: retailerResponse.status, message: errorPayload.error || 'Unable to load retailer.' })
        setLoading(false)
        return
      }

      if (!retailersResponse.ok) {
        const errorPayload = await retailersResponse.json().catch(() => ({ error: 'Unable to load retailers.' }))
        setError({ status: retailersResponse.status, message: errorPayload.error || 'Unable to load retailers.' })
        setLoading(false)
        return
      }

      const retailerData: RetailerDetails = await retailerResponse.json()
      const retailerList: RetailerListItem[] = await retailersResponse.json()

      if (configResponse.ok) {
        const configJson = await configResponse.json()
        const features = configJson?.features_enabled || {}
        setRetailerConfig({
          insights: features.insights !== false,
          market_insights: features.market_insights !== false,
        })
      }

      setRetailer(retailerData)
      setRetailers(retailerList)
    } catch (fetchError) {
      setError({
        message: fetchError instanceof Error ? fetchError.message : 'Unable to load retailer data.',
      })
    } finally {
      setLoading(false)
    }
  }, [retailerId])

  useEffect(() => {
    fetchRetailerData()
  }, [fetchRetailerData])

  const handleClientChange = (nextRetailerId: string) => {
    if (nextRetailerId === retailerId) return

    setIsSwitching(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', retailerId)
    if (isViewingAsClient) {
      params.set('viewAsClient', '1')
    } else {
      params.delete('viewAsClient')
    }
    const query = params.toString()
    router.push(`/client/${nextRetailerId}${query ? `?${query}` : ''}`)
  }

  const handleViewingToggle = (nextValue: boolean) => {
    setIsViewingAsClient(nextValue)
    const params = new URLSearchParams(searchParams.toString())
    if (nextValue) {
      params.set('viewAsClient', '1')
    } else {
      params.delete('viewAsClient')
    }
    params.delete('from')
    const query = params.toString()
    router.replace(`/client/${retailerId}${query ? `?${query}` : ''}`)
  }

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'keywords', label: 'Search Terms' },
      { id: 'categories', label: 'Categories' },
      { id: 'products', label: 'Products' },
      { id: 'auctions', label: 'Auctions' },
    ],
    []
  )

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase()

  const isStaff = session?.user?.role === 'SALES_TEAM' || session?.user?.role === 'CSS_ADMIN'

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader user={{ name: session?.user?.name, email: session?.user?.email, role: session?.user?.role }} />
        <div className="max-w-[1800px] mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-20 rounded-lg bg-gray-200" />
            <div className="h-12 rounded-lg bg-gray-200" />
            <div className="h-64 rounded-lg bg-gray-200" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    const isNotFound = error.status === 404
    const isForbidden = error.status === 403
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader user={{ name: session?.user?.name, email: session?.user?.email, role: session?.user?.role }} />
        <div className="max-w-[1800px] mx-auto px-6 py-12">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {isNotFound
                ? 'Client not found'
                : isForbidden
                ? 'Access denied'
                : 'Unable to load client'}
            </h2>
            <p className="text-sm text-gray-600 mb-6">{error.message}</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                type="button"
                onClick={fetchRetailerData}
                className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
              >
                Retry
              </button>
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm font-semibold rounded-md bg-[#1C1D1C] text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!retailer) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader
        user={{ name: session?.user?.name, email: session?.user?.email, role: session?.user?.role }}
        retailerName={retailer.retailer_name}
        showStaffMenu={isStaff}
      />

      {isStaff && (
        <StaffActionsBar
          retailerName={retailer.retailer_name}
          onAccountManagement={() => setShowAccountManagement(true)}
          onAccountOptions={() => setShowAccountOptions(true)}
          onManageInsights={() => setShowManageInsights(true)}
          onReportPrompts={() => setShowReportPrompts(true)}
        />
      )}

      <TabNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isViewingAsClient={isViewingAsClient}
        tabs={tabs}
      >
        <DateRangeSelectorWrapper />
      </TabNavigation>

      <main className="max-w-[1800px] mx-auto px-6 py-3" role="tabpanel" id={`tab-panel-${activeTab}`}>
        {activeTab === 'overview' && <OverviewTab retailerId={retailerId} retailerConfig={retailerConfig} />}
        {activeTab === 'keywords' && <KeywordsTab retailerId={retailerId} retailerConfig={retailerConfig} />}
        {activeTab === 'categories' && <CategoriesTab />}
        {activeTab === 'products' && <ProductsTab />}
        {activeTab === 'auctions' && <AuctionsTab />}
      </main>

      {/* Admin Modals */}
      <AdminModal
        isOpen={showAccountManagement}
        onClose={() => setShowAccountManagement(false)}
        title="Account"
      >
        <AccountManagement retailerId={retailerId} />
      </AdminModal>

      <AdminModal
        isOpen={showAccountOptions}
        onClose={() => setShowAccountOptions(false)}
        title="Display"
      >
        <AccountOptions retailerId={retailerId} />
      </AdminModal>

      <AdminModal
        isOpen={showManageInsights}
        onClose={() => setShowManageInsights(false)}
        title="Manage Reports"
      >
        <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-gray-500">
          <p className="text-sm font-medium">Manage Reports content coming soon.</p>
        </div>
      </AdminModal>

      <AdminModal
        isOpen={showReportPrompts}
        onClose={() => setShowReportPrompts(false)}
        title="Report Prompts"
      >
        <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-gray-500">
          <p className="text-sm font-medium">Report Prompts editor coming soon.</p>
        </div>
      </AdminModal>
    </div>
  )
}
