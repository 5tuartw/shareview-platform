import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryAnalytics } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { serializeAnalyticsData } from '@/lib/analytics-utils'

export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const retailerId = searchParams.get('retailerId')
    const pageType = searchParams.get('pageType')
    const tab = searchParams.get('tab')
    const period = searchParams.get('period')

    if (!retailerId || !pageType || !tab || !period) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const periodStart = `${period}-01`

    const result = await queryAnalytics<{
      component_type: string
      component_data: Record<string, unknown>
    }>(
      `
      SELECT component_type, component_data
      FROM page_insights
      WHERE retailer_id = $1
        AND page_type = $2
        AND tab_name = $3
        AND period_start = $4
        AND is_active = TRUE
      ORDER BY component_type
      `,
      [retailerId, pageType, tab, periodStart]
    )

    const response: {
      headline: Record<string, unknown> | null
      metricCards: Array<Record<string, unknown>>
      contextualInfo: Record<string, unknown> | null
      insightsPanel: Record<string, unknown> | null
    } = {
      headline: null,
      metricCards: [],
      contextualInfo: null,
      insightsPanel: null,
    }

    for (const row of result.rows) {
      switch (row.component_type) {
        case 'headline':
        case 'page_headline':
          response.headline = row.component_data
          break
        case 'metric_card':
        case 'metric_cards':
          response.metricCards.push(row.component_data)
          break
        case 'contextual_info':
        case 'contextual_info_panel':
          response.contextualInfo = row.component_data
          break
        case 'insights_panel':
          response.insightsPanel = row.component_data
          break
        default:
          break
      }
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'page_insights', pageType, tab },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching page insights:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch page insights',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
