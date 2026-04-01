import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasRole } from '@/lib/permissions'
import { queryAnalytics, getAnalyticsNetworkId } from '@/lib/db'
import { serializeAnalyticsData } from '@/lib/analytics-utils'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const viewType = searchParams.get('view') === 'monthly' ? 'monthly' : 'weekly'

    const networkId = await getAnalyticsNetworkId(retailerId, 'overview')
    if (!networkId) {
      return NextResponse.json({ rows: [], view_type: viewType, retailer_id: retailerId })
    }

    let rows: Record<string, unknown>[]

    if (viewType === 'weekly') {
      const result = await queryAnalytics(
        `SELECT DISTINCT ON (rm.period_start_date)
           rm.retailer_id,
           rm.retailer_name,
           rm.network,
           rm.report_month,
           rm.period_start_date,
           rm.period_end_date,
           rm.fetch_datetime,
           rm.impressions,
           rm.google_clicks,
           rm.network_clicks,
           rm.assists,
           rm.network_conversions_transaction,
           rm.google_conversions_transaction,
           rm.network_conversions_click,
           rm.google_conversions_click,
           rm.no_of_orders,
           rm.gmv,
           rm.commission_unvalidated,
           rm.commission_validated,
           rm.validation_rate,
           rm.css_spend,
           rm.profit,
           rm.ctr,
           rm.cpc,
           rm.conversion_rate,
           rm.epc,
           rm.validated_epc,
           rm.net_epc,
           rm.roi,
           rm.previous_commission_rate,
           rm.current_commission_rate
         FROM retailer_metrics rm
         JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
         WHERE rm.retailer_id = $1
           AND rm.period_start_date IS NOT NULL
           AND fr.fetch_type = '13_weeks'
         ORDER BY rm.period_start_date DESC, rm.fetch_datetime DESC`,
        [networkId]
      )
      rows = result.rows
    } else {
      const result = await queryAnalytics(
        `SELECT * FROM (
           SELECT DISTINCT ON (rm.report_month)
             rm.retailer_id,
             rm.retailer_name,
             rm.network,
             rm.report_month,
             rm.report_date,
             rm.fetch_datetime,
             rm.impressions,
             rm.google_clicks,
             rm.network_clicks,
             rm.assists,
             rm.network_conversions_transaction,
             rm.google_conversions_transaction,
             rm.network_conversions_click,
             rm.google_conversions_click,
             rm.no_of_orders,
             rm.gmv,
             rm.commission_unvalidated,
             rm.commission_validated,
             rm.validation_rate,
             rm.css_spend,
             rm.profit,
             rm.ctr,
             rm.cpc,
             rm.conversion_rate,
             rm.epc,
             rm.validated_epc,
             rm.net_epc,
             rm.roi,
             rm.previous_commission_rate,
             rm.current_commission_rate
           FROM retailer_metrics rm
           JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
           WHERE rm.retailer_id = $1
             AND fr.fetch_type IN ('current_month', '12_months')
           ORDER BY rm.report_month, rm.fetch_datetime DESC
         ) sub
         ORDER BY sub.report_date DESC`,
        [networkId]
      )
      rows = result.rows
    }

    return NextResponse.json(
      serializeAnalyticsData({
        rows,
        view_type: viewType,
        retailer_id: retailerId,
        network_id: networkId,
      })
    )
  } catch (error) {
    console.error('RSR data error:', error)
    return NextResponse.json(
      { error: 'Failed to load RSR data' },
      { status: 500 }
    )
  }
}
