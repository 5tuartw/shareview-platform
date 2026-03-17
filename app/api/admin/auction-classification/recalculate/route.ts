import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { recalculateAuctionQuadrants } from '@/lib/auction-classification-config'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as { retailer_id?: string } | null
    const retailerId = body?.retailer_id?.trim() || undefined

    const result = await recalculateAuctionQuadrants(retailerId)

    return NextResponse.json({
      ok: true,
      rows_updated: result.rowsUpdated,
      retailers_updated: result.retailersUpdated,
      months_updated: result.monthsUpdated,
      scope: retailerId ? 'retailer' : 'all',
      retailer_id: retailerId ?? null,
    })
  } catch (error) {
    console.error('Auction classification recalculate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
