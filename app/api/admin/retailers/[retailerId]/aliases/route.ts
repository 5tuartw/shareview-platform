import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, transaction } from '@/lib/db'
import { hasActiveRole } from '@/lib/permissions'
import { normalizeBrandCatalogValue } from '@/lib/brand-catalog'

type Params = {
  retailerId: string
}

type RetailerAliasType = 'manual' | 'display_name' | 'search_term' | 'typo' | 'legacy' | 'provider_specific'

type RetailerAliasRow = {
  retailer_alias_id: number
  retailer_id: string
  alias_name: string
  alias_name_normalized: string
  alias_type: RetailerAliasType
  source: string
  confidence: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type CreateRetailerAliasBody = {
  alias_name?: string
  alias_type?: RetailerAliasType
  confidence?: number | null
  is_active?: boolean
  notes?: string | null
}

const RETAILER_ALIAS_TYPES: RetailerAliasType[] = [
  'manual',
  'display_name',
  'search_term',
  'typo',
  'legacy',
  'provider_specific',
]

const STAFF_MANUAL_SOURCE = 'staff-manual'

const isRetailerAliasType = (value: unknown): value is RetailerAliasType => {
  return typeof value === 'string' && RETAILER_ALIAS_TYPES.includes(value as RetailerAliasType)
}

const parseConfidence = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('confidence must be a number between 0 and 1, or null.')
  }

  return value
}

const formatAlias = (row: RetailerAliasRow) => ({
  retailer_alias_id: row.retailer_alias_id,
  retailer_id: row.retailer_id,
  alias_name: row.alias_name,
  alias_name_normalized: row.alias_name_normalized,
  alias_type: row.alias_type,
  source: row.source,
  confidence: row.confidence !== null ? Number(row.confidence) : null,
  is_active: row.is_active,
  notes: row.notes,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden: Staff or Super Admin role required' }, { status: 403 })
    }

    const { retailerId } = await params

    const retailerResult = await query<{ retailer_id: string; retailer_name: string }>(
      `SELECT retailer_id, retailer_name FROM retailers WHERE retailer_id = $1`,
      [retailerId]
    )

    if (retailerResult.rowCount === 0) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

    const aliasesResult = await query<RetailerAliasRow>(
      `SELECT
         retailer_alias_id,
         retailer_id,
         alias_name,
         alias_name_normalized,
         alias_type,
         source,
         confidence::text,
         is_active,
         notes,
         created_at::text,
         updated_at::text
       FROM retailer_aliases
       WHERE retailer_id = $1
       ORDER BY is_active DESC, alias_type ASC, alias_name ASC`,
      [retailerId]
    )

    return NextResponse.json({
      retailer_id: retailerResult.rows[0].retailer_id,
      retailer_name: retailerResult.rows[0].retailer_name,
      aliases: aliasesResult.rows.map(formatAlias),
    })
  } catch (error) {
    console.error('Get retailer aliases error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden: Staff or Super Admin role required' }, { status: 403 })
    }

    const { retailerId } = await params
    const body = (await request.json()) as CreateRetailerAliasBody
    const aliasName = body.alias_name?.trim()

    if (!aliasName) {
      return NextResponse.json({ error: 'alias_name is required.' }, { status: 400 })
    }

    const aliasType = body.alias_type ?? 'manual'
    if (!isRetailerAliasType(aliasType)) {
      return NextResponse.json({ error: 'alias_type is invalid.' }, { status: 400 })
    }

    const confidence = parseConfidence(body.confidence)
    const isActive = body.is_active !== false
    const notes = body.notes?.trim() || null
    const aliasNameNormalized = normalizeBrandCatalogValue(aliasName)

    const result = await transaction(async (client) => {
      const retailerResult = await client.query<{ retailer_id: string; retailer_name: string }>(
        `SELECT retailer_id, retailer_name FROM retailers WHERE retailer_id = $1`,
        [retailerId]
      )

      if (retailerResult.rowCount === 0) {
        throw new Error('Retailer not found')
      }

      const aliasResult = await client.query<RetailerAliasRow>(
        `INSERT INTO retailer_aliases (
           retailer_id,
           alias_name,
           alias_name_normalized,
           alias_type,
           source,
           confidence,
           is_active,
           notes,
           metadata,
           created_at,
           updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           jsonb_build_object('created_by', 'staff', 'created_from', 'manage-retailers'),
           NOW(), NOW()
         )
         ON CONFLICT (source, alias_name_normalized)
         DO UPDATE SET
           retailer_id = EXCLUDED.retailer_id,
           alias_name = EXCLUDED.alias_name,
           alias_type = EXCLUDED.alias_type,
           confidence = EXCLUDED.confidence,
           is_active = EXCLUDED.is_active,
           notes = EXCLUDED.notes,
           updated_at = NOW()
         RETURNING retailer_alias_id, retailer_id, alias_name, alias_name_normalized, alias_type, source,
           confidence::text, is_active, notes, created_at::text, updated_at::text`,
        [retailerId, aliasName, aliasNameNormalized, aliasType, STAFF_MANUAL_SOURCE, confidence, isActive, notes]
      )

      return {
        retailer: retailerResult.rows[0],
        alias: aliasResult.rows[0],
      }
    })

    return NextResponse.json({
      retailer_id: result.retailer.retailer_id,
      retailer_name: result.retailer.retailer_name,
      alias: formatAlias(result.alias),
    }, { status: 201 })
  } catch (error) {
    console.error('Create retailer alias error:', error)

    if (error instanceof Error && (
      error.message === 'Retailer not found' ||
      error.message === 'confidence must be a number between 0 and 1, or null.'
    )) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Retailer not found' ? 404 : 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}