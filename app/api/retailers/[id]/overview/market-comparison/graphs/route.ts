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

type SavedGraphRow = {
  id: number
  retailer_id: string
  scope: string
  name: string
  metric: GraphMetric
  view_type: GraphViewType
  period_start: string
  period_end: string
  include_provisional: boolean
  match_mode: MatchMode
  domain_match_modes: DomainMatchModes
  filters: Record<string, string[]>
  position: number
  is_active: boolean
  created_by: number | null
  updated_by: number | null
  created_at: string
  updated_at: string
}

type CreateGraphPayload = {
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
  scope?: string
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
    const includeInactive = searchParams.get('include_inactive') === 'true'

    const result = await query<SavedGraphRow>(
      `SELECT id, retailer_id, scope, name, metric, view_type,
              period_start::text, period_end::text,
              include_provisional, match_mode, domain_match_modes, filters, position, is_active,
              created_by, updated_by, created_at, updated_at
       FROM overview_market_comparison_graphs
       WHERE retailer_id = $1
         AND scope = 'overview'
         AND ($2::boolean = true OR is_active = true)
       ORDER BY position ASC, created_at ASC`,
      [retailerId, includeInactive]
    )

    return NextResponse.json(result.rows)
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '42703') {
      try {
        const { id: retailerId } = await context.params
        const { searchParams } = new URL(request.url)
        const includeInactive = searchParams.get('include_inactive') === 'true'

        const fallback = await query<Omit<SavedGraphRow, 'domain_match_modes'>>(
          `SELECT id, retailer_id, scope, name, metric, view_type,
                  period_start::text, period_end::text,
                  include_provisional, match_mode, filters, position, is_active,
                  created_by, updated_by, created_at, updated_at
           FROM overview_market_comparison_graphs
           WHERE retailer_id = $1
             AND scope = 'overview'
             AND ($2::boolean = true OR is_active = true)
           ORDER BY position ASC, created_at ASC`,
          [retailerId, includeInactive]
        )

        return NextResponse.json(
          fallback.rows.map((row) => ({
            ...row,
            domain_match_modes: {},
          }))
        )
      } catch (fallbackError) {
        console.error('Error fetching legacy market comparison saved graphs:', fallbackError)
        return NextResponse.json([])
      }
    }

    if (pgError.code === '42P01') {
      return NextResponse.json([])
    }
    console.error('Error fetching market comparison saved graphs:', error)
    return NextResponse.json({ error: 'Failed to fetch saved graphs' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: retailerId } = await context.params
    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden: Staff or Super Admin role required' }, { status: 403 })
    }

    const body = (await request.json().catch(() => null)) as CreateGraphPayload | null
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const name = (body.name ?? '').trim()
    const metric = body.metric
    const viewType = body.view_type
    const periodStart = toDateOnly(body.period_start)
    const periodEnd = toDateOnly(body.period_end)
    const includeProvisional = body.include_provisional !== false
    const matchMode: MatchMode = body.match_mode === 'any' ? 'any' : 'all'
    const domainMatchModes = normaliseDomainMatchModes(body.domain_match_modes)
    const filters = normaliseFilters(body.filters)

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!metric || !ALLOWED_METRICS.has(metric)) {
      return NextResponse.json({ error: 'metric is invalid' }, { status: 400 })
    }
    if (!viewType || !ALLOWED_VIEW_TYPES.has(viewType)) {
      return NextResponse.json({ error: 'view_type is invalid' }, { status: 400 })
    }
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: 'period_start and period_end are required (YYYY-MM-DD)' }, { status: 400 })
    }
    if (periodStart > periodEnd) {
      return NextResponse.json({ error: 'period_start must be before or equal to period_end' }, { status: 400 })
    }
    if (!ALLOWED_MATCH_MODES.has(matchMode)) {
      return NextResponse.json({ error: 'match_mode is invalid' }, { status: 400 })
    }

    const requestedPosition = Number.isInteger(body.position) ? Number(body.position) : null
    const nextPositionResult = await query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM overview_market_comparison_graphs
       WHERE retailer_id = $1 AND scope = 'overview'`,
      [retailerId]
    )
    const finalPosition = requestedPosition !== null && requestedPosition >= 0
      ? requestedPosition
      : (nextPositionResult.rows[0]?.next_position ?? 0)

    const userId = Number.parseInt(session.user.id, 10)

    const result = await query<SavedGraphRow>(
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
        name,
        metric,
        viewType,
        periodStart,
        periodEnd,
        includeProvisional,
        matchMode,
        JSON.stringify(domainMatchModes),
        JSON.stringify(filters),
        finalPosition,
        Number.isFinite(userId) ? userId : null,
      ]
    )

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '42P01' || pgError.code === '42703') {
      return NextResponse.json({ error: 'Saved graph storage is not available yet. Run database migrations first.' }, { status: 503 })
    }
    console.error('Error creating market comparison saved graph:', error)
    return NextResponse.json({ error: 'Failed to create saved graph' }, { status: 500 })
  }
}
