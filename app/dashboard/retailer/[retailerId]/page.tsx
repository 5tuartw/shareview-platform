import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import RetailerAdminDashboard from '@/components/admin/RetailerAdminDashboard'
import type { RetailerConfigResponse } from '@/types'

interface RetailerPageProps {
    params: Promise<{ retailerId: string }>
}

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
const DEFAULT_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']

const DEFAULT_FEATURES = {
    insights: true,
    competitor_comparison: true,
    market_insights: true,
}

const loadRetailerName = async (retailerId: string) => {
    console.log('loadRetailerName called with:', { retailerId, type: typeof retailerId })
    const result = await query('SELECT retailer_name FROM retailers WHERE retailer_id = $1', [retailerId])
    if (result.rows.length === 0) return null
    return result.rows[0].retailer_name as string
}

const loadRetailerConfig = async (retailerId: string): Promise<RetailerConfigResponse> => {
    const result = await query('SELECT * FROM retailers WHERE retailer_id = $1', [retailerId])

    if (result.rows.length > 0) {
        const row = result.rows[0]
        const features = typeof row.features_enabled === 'string' ? JSON.parse(row.features_enabled) : row.features_enabled

        return {
            retailer_id: retailerId,
            visible_tabs: (row.visible_tabs || DEFAULT_TABS).filter((t: string) => t !== 'coverage'),
            visible_metrics: row.visible_metrics || DEFAULT_METRICS,
            keyword_filters: row.keyword_filters || [],
            features_enabled: features || DEFAULT_FEATURES,
            updated_by: row.config_updated_by || null,
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

export default async function AdminRetailerPage({ params }: RetailerPageProps) {
    const { retailerId } = await params
    const session = await auth()
    if (!session?.user) {
        redirect('/login')
    }

    if (session.user.role !== 'SALES_TEAM' && session.user.role !== 'CSS_ADMIN') {
        redirect('/login')
    }

    const retailerName = await loadRetailerName(retailerId)
    if (!retailerName) {
        redirect('/dashboard')
    }

    const config = await loadRetailerConfig(retailerId)

    return (
        <RetailerAdminDashboard
            retailerId={retailerId}
            retailerName={retailerName}
            config={config}
            user={session.user}
        />
    )
}
