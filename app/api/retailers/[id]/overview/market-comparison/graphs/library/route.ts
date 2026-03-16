import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, filterRetailersByAccess } from '@/lib/permissions'
import { query } from '@/lib/db'

type SharedGraphRow = {
  id: number
  retailer_id: string
  retailer_name: string
  name: string
  metric: 'gmv' | 'profit' | 'impressions' | 'clicks' | 'conversions' | 'ctr' | 'cvr' | 'roi'
  view_type: 'monthly' | 'weekly'
  period_start: string
  period_end: string
  include_provisional: boolean
  match_mode: 'all' | 'any'
  domain_match_modes: Record<string, 'all' | 'any'>
  filters: Record<string, string[]>
  position: number
  updated_at: string
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: retailerId } = await context.params
    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const queryText = (searchParams.get('q') ?? '').trim().toLowerCase()
    const limitRaw = Number.parseInt(searchParams.get('limit') ?? '60', 10)
    const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(200, limitRaw)) : 60

    const accessibleRetailers = await filterRetailersByAccess(session)
    const accessibleRetailerIds = accessibleRetailers.map((row) => row.retailer_id)

    if (accessibleRetailerIds.length === 0) {
      return NextResponse.json([])
    }

    const rows = await query<SharedGraphRow>(
      `SELECT g.id,
              g.retailer_id,
              r.retailer_name,
              g.name,
              g.metric,
              g.view_type,
              g.period_start::text,
              g.period_end::text,
              g.include_provisional,
              g.match_mode,
              g.domain_match_modes,
              g.filters,
              g.position,
              g.updated_at::text
       FROM overview_market_comparison_graphs g
       JOIN retailers r ON r.retailer_id = g.retailer_id
       WHERE g.scope = 'overview'
         AND g.is_active = true
         AND g.retailer_id = ANY($1)
         AND (
           $2 = ''
           OR LOWER(g.name) LIKE '%' || $2 || '%'
           OR LOWER(r.retailer_name) LIKE '%' || $2 || '%'
         )
       ORDER BY g.updated_at DESC
       LIMIT $3`,
      [accessibleRetailerIds, queryText, limit]
    )

    return NextResponse.json(rows.rows)
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '42P01' || pgError.code === '42703') {
      return NextResponse.json([])
    }

    console.error('Error loading market comparison shared graph library:', error)
    return NextResponse.json({ error: 'Failed to load shared graph library' }, { status: 500 })
  }
}
