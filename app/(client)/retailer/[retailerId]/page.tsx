import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import { logActivity } from '@/lib/activity-logger'
import RetailerClientDashboard from '@/components/client/RetailerClientDashboard'
import type { RetailerConfigResponse } from '@/types'

interface RetailerPageProps {
  params: { retailerId: string }
}

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
const DEFAULT_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']

const DEFAULT_FEATURES = {
  insights: true,
  competitor_comparison: true,
  market_insights: true,
}

const loadRetailerName = async (retailerId: string) => {
  const result = await query('SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1', [retailerId])
  if (result.rows.length === 0) return null
  return result.rows[0].retailer_name as string
}

const loadRetailerConfig = async (retailerId: string): Promise<RetailerConfigResponse> => {
  const result = await query('SELECT * FROM retailer_config WHERE retailer_id = $1', [retailerId])

  if (result.rows.length > 0) {
    const row = result.rows[0]
    const features = typeof row.features_enabled === 'string' ? JSON.parse(row.features_enabled) : row.features_enabled

    return {
      retailer_id: retailerId,
      visible_tabs: row.visible_tabs || DEFAULT_TABS,
      visible_metrics: row.visible_metrics || DEFAULT_METRICS,
      keyword_filters: row.keyword_filters || [],
      features_enabled: features || DEFAULT_FEATURES,
      updated_by: row.updated_by || null,
      updated_at: row.updated_at || new Date().toISOString(),
    }
  }

  return {
    retailer_id: retailerId,
    visible_tabs: DEFAULT_TABS,
    visible_metrics: DEFAULT_METRICS,
    keyword_filters: [],
    features_enabled: DEFAULT_FEATURES,
    updated_by: null,
    updated_at: new Date().toISOString(),
  }
}

export default async function RetailerClientPage({ params }: RetailerPageProps) {
  const { retailerId } = params
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  if (!canAccessRetailer(session, retailerId)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center max-w-md">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Access denied</h1>
          <p className="text-sm text-gray-600 mb-6">
            You do not have permission to view this retailer dashboard.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-md bg-[#1C1D1C] text-white hover:bg-black"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  const retailerName = (await loadRetailerName(retailerId)) || `Retailer ${retailerId}`
  const config = await loadRetailerConfig(retailerId)

  const retailerCheck = await query('SELECT retailer_id FROM retailer_metadata WHERE retailer_id = $1', [retailerId])
  const safeRetailerId = retailerCheck.rows.length > 0 ? retailerId : undefined

  const headerList = await headers()
  const ipAddress = headerList.get('x-forwarded-for') || headerList.get('x-real-ip') || undefined
  const userAgent = headerList.get('user-agent') || undefined

  await logActivity({
    userId: parseInt(session.user.id, 10),
    action: 'retailer_viewed',
    retailerId: safeRetailerId,
    entityType: 'retailer',
    entityId: retailerId,
    details: { source: 'client_portal' },
    ipAddress,
    userAgent,
  })

  return <RetailerClientDashboard retailerId={retailerId} retailerName={retailerName} config={config} />
}
