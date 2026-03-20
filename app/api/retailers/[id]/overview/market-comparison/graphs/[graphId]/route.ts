import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import { MARKET_PROFILE_DOMAINS, type MarketProfileDomainKey } from '@/lib/market-profiles'

type GraphMetric = 'gmv' | 'impressions' | 'clicks' | 'conversions' | 'ctr' | 'cvr'
type GraphViewType = 'monthly' | 'weekly'
type MatchMode = 'all' | 'any'
type DomainMatchMode = 'all' | 'any'
type DomainMatchModes = Record<string, DomainMatchMode>

type UpdateGraphPayload = {
  name?: string
  metric?: GraphMetric
  view_type?: GraphViewType
  period_start?: string
  period_end?: string
  include_provisional?: boolean
  match_mode?: MatchMode
  domain_match_modes?: DomainMatchModes
  filters?: Record<string, string[]>
  position?: number
  is_active?: boolean
}

const ALLOWED_METRICS = new Set<GraphMetric>(['gmv', 'impressions', 'clicks', 'conversions', 'ctr', 'cvr'])
const ALLOWED_VIEW_TYPES = new Set<GraphViewType>(['monthly', 'weekly'])
const ALLOWED_MATCH_MODES = new Set<MatchMode>(['all', 'any'])
const ALLOWED_DOMAINS = new Set<MarketProfileDomainKey>(MARKET_PROFILE_DOMAINS.map((domain) => domain.key))

const toDateOnly = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  return trimmed
}

const normaliseFilters = (filters: unknown): Record<string, string[]> => {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {}

  const next: Record<string, string[]> = {}
  for (const [rawDomain, values] of Object.entries(filters as Record<string, unknown>)) {
    if (!ALLOWED_DOMAINS.has(rawDomain as MarketProfileDomainKey)) continue
    if (!Array.isArray(values)) continue

    const unique = Array.from(new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    ))

    if (unique.length > 0) {
      next[rawDomain] = unique
    }
  }

  return next
}

const normaliseDomainMatchModes = (input: unknown): DomainMatchModes => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const next: DomainMatchModes = {}
  for (const [rawDomain, mode] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_DOMAINS.has(rawDomain as MarketProfileDomainKey)) continue
    next[rawDomain] = mode === 'all' ? 'all' : 'any'
  }

  return next
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; graphId: string }> }) {
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

    const body = (await request.json().catch(() => null)) as UpdateGraphPayload | null
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const updates: string[] = []
    const values: Array<string | number | boolean> = []
    let idx = 1

    if (body.name !== undefined) {
      const trimmed = body.name.trim()
      if (!trimmed) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      updates.push(`name = $${idx++}`)
      values.push(trimmed)
    }

    if (body.metric !== undefined) {
      if (!ALLOWED_METRICS.has(body.metric)) {
        return NextResponse.json({ error: 'metric is invalid' }, { status: 400 })
      }
      updates.push(`metric = $${idx++}`)
      values.push(body.metric)
    }

    if (body.view_type !== undefined) {
      if (!ALLOWED_VIEW_TYPES.has(body.view_type)) {
        return NextResponse.json({ error: 'view_type is invalid' }, { status: 400 })
      }
      updates.push(`view_type = $${idx++}`)
      values.push(body.view_type)
    }

    if (body.period_start !== undefined) {
      const value = toDateOnly(body.period_start)
      if (!value) {
        return NextResponse.json({ error: 'period_start must be YYYY-MM-DD' }, { status: 400 })
      }
      updates.push(`period_start = $${idx++}::date`)
      values.push(value)
    }

    if (body.period_end !== undefined) {
      const value = toDateOnly(body.period_end)
      if (!value) {
        return NextResponse.json({ error: 'period_end must be YYYY-MM-DD' }, { status: 400 })
      }
      updates.push(`period_end = $${idx++}::date`)
      values.push(value)
    }

    if (body.include_provisional !== undefined) {
      updates.push(`include_provisional = $${idx++}`)
      values.push(Boolean(body.include_provisional))
    }

    if (body.match_mode !== undefined) {
      if (!ALLOWED_MATCH_MODES.has(body.match_mode)) {
        return NextResponse.json({ error: 'match_mode is invalid' }, { status: 400 })
      }
      updates.push(`match_mode = $${idx++}`)
      values.push(body.match_mode)
    }

    if (body.domain_match_modes !== undefined) {
      updates.push(`domain_match_modes = $${idx++}::jsonb`)
      values.push(JSON.stringify(normaliseDomainMatchModes(body.domain_match_modes)))
    }

    if (body.filters !== undefined) {
      updates.push(`filters = $${idx++}::jsonb`)
      values.push(JSON.stringify(normaliseFilters(body.filters)))
    }

    if (body.position !== undefined) {
      if (!Number.isInteger(body.position) || Number(body.position) < 0) {
        return NextResponse.json({ error: 'position must be a non-negative integer' }, { status: 400 })
      }
      updates.push(`position = $${idx++}`)
      values.push(Number(body.position))
    }

    if (body.is_active !== undefined) {
      updates.push(`is_active = $${idx++}`)
      values.push(Boolean(body.is_active))
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const userId = Number.parseInt(session.user.id, 10)
    updates.push(`updated_by = $${idx++}`)
    values.push(Number.isFinite(userId) ? userId : 0)
    updates.push(`updated_at = NOW()`)

    values.push(retailerId)
    const retailerParam = idx++
    values.push(graphId)
    const graphParam = idx++

    const result = await query(
      `UPDATE overview_market_comparison_graphs
       SET ${updates.join(', ')}
       WHERE retailer_id = $${retailerParam}
         AND scope = 'overview'
         AND id = $${graphParam}::bigint
       RETURNING id, retailer_id, scope, name, metric, view_type,
                 period_start::text, period_end::text,
                 include_provisional, match_mode, domain_match_modes, filters, position, is_active,
                 created_by, updated_by, created_at, updated_at`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Saved graph not found' }, { status: 404 })
    }

    const graph = result.rows[0] as {
      period_start: string
      period_end: string
    }

    if (graph.period_start > graph.period_end) {
      return NextResponse.json({ error: 'period_start must be before or equal to period_end' }, { status: 400 })
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '42P01' || pgError.code === '42703') {
      return NextResponse.json({ error: 'Saved graph storage is not available yet. Run database migrations first.' }, { status: 503 })
    }
    console.error('Error updating market comparison saved graph:', error)
    return NextResponse.json({ error: 'Failed to update saved graph' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; graphId: string }> }) {
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

    const userId = Number.parseInt(session.user.id, 10)

    const result = await query(
      `UPDATE overview_market_comparison_graphs
       SET is_active = false,
           updated_by = $1,
           updated_at = NOW()
       WHERE retailer_id = $2
         AND scope = 'overview'
         AND id = $3::bigint
         AND is_active = true
       RETURNING id`,
      [Number.isFinite(userId) ? userId : null, retailerId, graphId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Saved graph not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '42P01' || pgError.code === '42703') {
      return NextResponse.json({ error: 'Saved graph storage is not available yet. Run database migrations first.' }, { status: 503 })
    }
    console.error('Error deleting market comparison saved graph:', error)
    return NextResponse.json({ error: 'Failed to delete saved graph' }, { status: 500 })
  }
}
