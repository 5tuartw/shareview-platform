import { NextRequest, NextResponse } from 'next/server'
import { validateAccessToken } from '@/lib/validate-access-token'

/**
 * Stub page-insights route for token-gated access.
 * Returns an empty but valid PageInsightsResponse so components that
 * call /api/page-insights don't crash for guest viewers.
 * The real /api/page-insights route requires a NextAuth session.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    const retailerId = new URL(request.url).searchParams.get('retailerId') || ''

    if (retailerId) {
      const validation = await validateAccessToken(request, token, retailerId)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: validation.status })
      }
    }

    // Return empty but well-shaped PageInsightsResponse
    return NextResponse.json({
      headline: null,
      metricCards: [],
      contextualInfo: null,
      insightsPanel: null,
    })
  } catch (error) {
    console.error('Error in access token page-insights proxy:', error)
    return NextResponse.json(
      { headline: null, metricCards: [], contextualInfo: null, insightsPanel: null },
      { status: 200 }
    )
  }
}
