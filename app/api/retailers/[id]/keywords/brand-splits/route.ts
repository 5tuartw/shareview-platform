import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { getRetailerKeywordBrandSplits } from '@/services/retailer/keyword-brand-splits'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const canViewBrandSplits = await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])
    if (!canViewBrandSplits) {
      return NextResponse.json({ error: 'Unauthorized: Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const result = await getRetailerKeywordBrandSplits(retailerId, searchParams)

    if (result.status !== 200) {
      return NextResponse.json(result.data, { status: result.status })
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: result.activityDetails,
    })

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Error fetching keyword brand splits:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch Brand Splits data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}