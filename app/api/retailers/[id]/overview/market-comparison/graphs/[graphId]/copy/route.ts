import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'

export async function POST(_request: Request, context: { params: Promise<{ id: string; graphId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: retailerId, graphId } = await context.params

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden: Staff or Super Admin role required' }, { status: 403 })
    }

    const sourceResult = await query<{
      name: string
      metric: string
      view_type: string
      period_start: string
      period_end: string
      include_provisional: boolean
      match_mode: string
            domain_match_modes: Record<string, 'all' | 'any'>
      filters: Record<string, string[]>
    }>(
      `SELECT name, metric, view_type,
              period_start::text, period_end::text,
              include_provisional, match_mode, domain_match_modes, filters
       FROM overview_market_comparison_graphs
       WHERE id = $1::bigint
         AND retailer_id = $2
         AND scope = 'overview'
         AND is_active = true`,
      [graphId, retailerId]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Saved graph not found' }, { status: 404 })
    }

    const source = sourceResult.rows[0]
    const nextPositionResult = await query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM overview_market_comparison_graphs
       WHERE retailer_id = $1 AND scope = 'overview'`,
      [retailerId]
    )

    const userId = Number.parseInt(session.user.id, 10)

    const inserted = await query(
      `INSERT INTO overview_market_comparison_graphs (
         retailer_id, scope, name, metric, view_type,
         period_start, period_end, include_provisional, match_mode, domain_match_modes,
         filters, position, is_active, created_by, updated_by
       ) VALUES (
         $1, 'overview', $2, $3, $4,
         $5::date, $6::date, $7, $8, $9::jsonb,
         $10::jsonb, $11, true, $12, $12
       )
       RETURNING id, retailer_id, scope, name, metric, view_type,
                 period_start::text, period_end::text,
                 include_provisional, match_mode, domain_match_modes, filters, position, is_active,
                 created_by, updated_by, created_at, updated_at`,
      [
        retailerId,
        `${source.name} (Copy)`,
        source.metric,
        source.view_type,
        source.period_start,
        source.period_end,
        source.include_provisional,
        source.match_mode,
        JSON.stringify(source.domain_match_modes ?? {}),
        JSON.stringify(source.filters ?? {}),
        nextPositionResult.rows[0]?.next_position ?? 0,
        Number.isFinite(userId) ? userId : null,
      ]
    )

    return NextResponse.json(inserted.rows[0], { status: 201 })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '42P01' || pgError.code === '42703') {
      return NextResponse.json({ error: 'Saved graph storage is not available yet. Run database migrations first.' }, { status: 503 })
    }
    console.error('Error copying market comparison saved graph:', error)
    return NextResponse.json({ error: 'Failed to copy saved graph' }, { status: 500 })
  }
}
