'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import ClientDropdown from '@/components/client/ClientDropdown'
import ViewingToggle from '@/components/client/ViewingToggle'
import TabNavigation from '@/components/client/TabNavigation'
import AccountManagement from '@/components/client/AccountManagement'
import AccountOptions from '@/components/client/AccountOptions'
import OverviewTab from '@/components/client/OverviewTab'
import DateRangeSelectorWrapper from '@/components/client/DateRangeSelectorWrapper'
import KeywordsTab from '@/components/client/KeywordsTab'
import CategoriesTab from '@/components/client/CategoriesTab'
import ProductsTab from '@/components/client/ProductsTab'
import AuctionsTab from '@/components/client/AuctionsTab'
import CoverageTab from '@/components/client/CoverageTab'
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

function AdminPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-gray-500">
      <p className="text-sm font-medium">{label} content coming soon.</p>
    </div>
  )
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
      { id: 'keywords', label: 'Keywords' },
      { id: 'categories', label: 'Categories' },
      { id: 'products', label: 'Products' },
      { id: 'auctions', label: 'Auctions' },
      { id: 'coverage', label: 'Coverage' },
      { id: 'account-management', label: 'Account Management', isAdmin: true },
      { id: 'account-options', label: 'Account Options', isAdmin: true },
      { id: 'manage-insights', label: 'Manage Insights', isAdmin: true },
      { id: 'analytics', label: 'Analytics', isAdmin: true },
      { id: 'activity-log', label: 'Activity Log', isAdmin: true },
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

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader user={{ name: session?.user?.name, email: session?.user?.email, role: session?.user?.role }} />
        <div className="max-w-7xl mx-auto px-6 py-8">
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
        <div className="max-w-7xl mx-auto px-6 py-12">
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
        showDateSelector
      >
        <DateRangeSelectorWrapper />
      </DashboardHeader>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
              {getInitials(retailer.retailer_name)}
            </div>
            <div className="text-sm text-gray-600">Switch client or preview the portal view</div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <ClientDropdown
              retailers={retailers}
              currentRetailerId={retailerId}
              onClientChange={handleClientChange}
              isSwitching={isSwitching}
            />
            <ViewingToggle isViewingAsClient={isViewingAsClient} onToggle={handleViewingToggle} />
          </div>
        </div>
      </div>

      <TabNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isViewingAsClient={isViewingAsClient}
        tabs={tabs}
      />

      <main className="max-w-7xl mx-auto px-6 py-8" role="tabpanel" id={`tab-panel-${activeTab}`}>
        {activeTab === 'overview' && <OverviewTab retailerId={retailerId} retailerConfig={retailerConfig} />}
        {activeTab === 'keywords' && <KeywordsTab />}
        {activeTab === 'categories' && <CategoriesTab />}
        {activeTab === 'products' && <ProductsTab />}
        {activeTab === 'auctions' && <AuctionsTab />}
        {activeTab === 'coverage' && <CoverageTab />}
        {activeTab === 'account-management' && <AccountManagement retailerId={retailerId} />}
        {activeTab === 'account-options' && <AccountOptions retailerId={retailerId} />}
        {activeTab === 'manage-insights' && <AdminPlaceholder label="Manage Insights" />}
        {activeTab === 'analytics' && <AdminPlaceholder label="Analytics" />}
        {activeTab === 'activity-log' && <AdminPlaceholder label="Activity Log" />}
      </main>
    </div>
  )
}
