import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import { parsePeriodParam, serializeAnalyticsData } from '@/lib/analytics-utils'
import { DomainMetricsResponse } from '@/types/page-insights'

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
    const tab = searchParams.get('tab') || 'performance'

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

    const result = await query<{
      component_type: string
      component_data: Record<string, unknown>
    }>(
      `SELECT component_type, component_data
       FROM domain_metrics
       WHERE retailer_id = $1
         AND page_type = $2
         AND tab_name = $3
         AND period_start = $4
         AND period_end = $5
         AND is_active = true
       ORDER BY component_type`,
      [retailerId, pageType, tab, periodStart, periodEnd]
    )

    const response: DomainMetricsResponse = {
      pageHeadline: null,
      metricCards: null,
      quickStats: null,
      contextualInfo: null,
    }

    const metricCardsArray: Record<string, unknown>[] = []

    for (const row of result.rows) {
      switch (row.component_type) {
        case 'page_headline':
          response.pageHeadline = row.component_data as DomainMetricsResponse['pageHeadline']
          break
        case 'metric_card':
          metricCardsArray.push(row.component_data)
          break
        case 'quick_stats':
          response.quickStats = row.component_data
          break
        case 'contextual_info':
          response.contextualInfo = row.component_data as DomainMetricsResponse['contextualInfo']
          break
        default:
          break
      }
    }

    if (metricCardsArray.length > 0) {
      response.metricCards = metricCardsArray as DomainMetricsResponse['metricCards']
    }

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching domain metrics:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch domain metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
