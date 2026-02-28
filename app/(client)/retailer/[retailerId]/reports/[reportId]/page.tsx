import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import RetailerClientDashboard from '@/components/client/RetailerClientDashboard'
import BackToReportsButton from '@/components/client/BackToReportsButton'

interface ReportPageProps {
  params: Promise<{
    retailerId: string
    reportId: string
  }>
}

const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
const DEFAULT_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']
const DEFAULT_FEATURES = {
  insights: true,
  competitor_comparison: true,
  market_insights: true,
}

const loadRetailerName = async (retailerId: string) => {
  const result = await query('SELECT retailer_name FROM retailers WHERE retailer_id = $1', [retailerId])
  if (result.rows.length === 0) return null
  return result.rows[0].retailer_name as string
}

const loadRetailerConfig = async (retailerId: string) => {
  const result = await query('SELECT * FROM retailers WHERE retailer_id = $1', [retailerId])

  if (result.rows.length > 0) {
    const row = result.rows[0]
    const features = typeof row.features_enabled === 'string' ? JSON.parse(row.features_enabled) : row.features_enabled

    return {
      retailer_id: retailerId,
      visible_tabs: row.visible_tabs || DEFAULT_TABS,
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

export default async function ReportPage({ params }: ReportPageProps) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const { retailerId, reportId } = await params

  // Check access to retailer
  if (!canAccessRetailer(session, retailerId)) {
    redirect('/unauthorized')
  }

  // Verify the report exists and belongs to this retailer
  const reportResult = await query(
    `SELECT id, retailer_id, title, period_type, period_start, period_end FROM reports WHERE id = $1`,
    [reportId]
  )

  if (reportResult.rows.length === 0) {
    redirect(`/retailer/${retailerId}`)
  }

  const report = reportResult.rows[0]
  const reportTitle =
    report.title ||
    `${report.period_type.charAt(0).toUpperCase() + report.period_type.slice(1)} Report`

  // Verify retailer match (handle both slug and ID)
  if (report.retailer_id !== retailerId) {
    // Try looking up if retailerId is a slug and get the actual ID
    const metadataResult = await query(
      `SELECT retailer_id FROM retailers
       WHERE LOWER(REGEXP_REPLACE(retailer_name, '[^a-zA-Z0-9]+', '-', 'g')) = $1`,

      [retailerId.toLowerCase()]
    )

    if (
      metadataResult.rows.length === 0 ||
      metadataResult.rows[0].retailer_id !== report.retailer_id
    ) {
      redirect(`/retailer/${retailerId}`)
    }
  }

  const retailerName = (await loadRetailerName(report.retailer_id)) || `Retailer ${report.retailer_id}`
  const config = await loadRetailerConfig(report.retailer_id)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-2">
        <div className="max-w-[1800px] mx-auto">
          <BackToReportsButton retailerId={retailerId} />
        </div>
      </div>
      <RetailerClientDashboard
        retailerId={report.retailer_id}
        retailerName={retailerName}
        config={config}
        reportId={parseInt(reportId, 10)}
        reportInfo={{
          title: reportTitle,
          period_start: report.period_start,
          period_end: report.period_end,
          period_type: report.period_type,
        }}
        reportPeriod={{
          start: report.period_start,
          end: report.period_end,
          type: report.period_type,
        }}
      />
    </div>
  )
}
