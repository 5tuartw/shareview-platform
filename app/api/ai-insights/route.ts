import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import { parsePeriodParam, serializeAnalyticsData } from '@/lib/analytics-utils'
import { AiInsightsResponse } from '@/types/page-insights'

export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const retailerId = searchParams.get('retailerId')
    const pageType = searchParams.get('pageType')
    const period = searchParams.get('period')
    const tab = searchParams.get('tab') || 'insights'

    if (!retailerId || !pageType || !period) {
      return NextResponse.json(
        { error: 'Missing required parameters: retailerId, pageType, period' },
        { status: 400 }
      )
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const { periodStart, periodEnd } = parsePeriodParam(period)

    // Run two parallel queries
    const [insightsResult, configResult] = await Promise.all([
      query<{
        insight_type: string
        insight_data: Record<string, unknown>
      }>(
        `SELECT insight_type, insight_data
         FROM ai_insights
         WHERE retailer_id = $1
           AND page_type = $2
           AND tab_name = $3
           AND period_start = $4
           AND period_end = $5
           AND is_active = true
         ORDER BY insight_type`,
        [retailerId, pageType, tab, periodStart, periodEnd]
      ),
      query<{
        features_enabled: Record<string, unknown>
      }>(
        `SELECT features_enabled
         FROM retailer_config
         WHERE retailer_id = $1`,
        [retailerId]
      ),
    ])

    const response: AiInsightsResponse = {
      insightsPanel: null,
      marketAnalysis: null,
      recommendation: null,
      showAIDisclaimer: false,
    }

    // Process insights
    for (const row of insightsResult.rows) {
      switch (row.insight_type) {
        case 'insight_panel':
          response.insightsPanel = row.insight_data as AiInsightsResponse['insightsPanel']
          break
        case 'market_analysis':
          response.marketAnalysis = row.insight_data
          break
        case 'recommendation':
          response.recommendation = row.insight_data
          break
        default:
          break
      }
    }

    // Set showAIDisclaimer from retailer config
    if (configResult.rows.length > 0) {
      const featuresEnabled = configResult.rows[0].features_enabled
      response.showAIDisclaimer = (featuresEnabled?.show_ai_disclaimer as boolean) ?? false
    }

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching AI insights:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch AI insights',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
