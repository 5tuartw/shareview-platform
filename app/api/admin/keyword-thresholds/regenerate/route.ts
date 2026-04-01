import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { generateSnapshots } from '@/services/snapshot-generator/generate-snapshots'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as {
      retailer_id?: string
      month?: string
    } | null
    const retailerId = body?.retailer_id?.trim() || undefined
    const month = body?.month?.trim() || undefined

    // Validate month format if provided
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 })
    }

    const results = await generateSnapshots({
      retailer: retailerId,
      month,
      force: true,
      domains: ['keywords'],
    })

    const snapshotsWritten = results.filter((r) => r.operation !== 'skipped').length
    const retailersUpdated = new Set(results.map((r) => r.retailerId)).size
    const monthsUpdated = new Set(results.map((r) => r.month)).size

    return NextResponse.json({
      ok: true,
      snapshots_written: snapshotsWritten,
      retailers_updated: retailersUpdated,
      months_updated: monthsUpdated,
      scope: retailerId ? 'retailer' : 'all',
      retailer_id: retailerId ?? null,
      month: month ?? null,
    })
  } catch (error) {
    console.error('Keyword snapshot regeneration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
