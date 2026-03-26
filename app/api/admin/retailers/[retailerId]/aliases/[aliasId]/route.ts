import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { transaction } from '@/lib/db'
import { hasActiveRole } from '@/lib/permissions'
import { normalizeBrandCatalogValue } from '@/lib/brand-catalog'

type Params = {
  retailerId: string
  aliasId: string
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

type UpdateRetailerAliasBody = {
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

export async function PATCH(
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

    const { retailerId, aliasId } = await params
    const numericAliasId = Number(aliasId)
    if (!Number.isInteger(numericAliasId) || numericAliasId <= 0) {
      return NextResponse.json({ error: 'aliasId must be a positive integer.' }, { status: 400 })
    }

    const body = (await request.json()) as UpdateRetailerAliasBody
    const confidence = parseConfidence(body.confidence)

    const updated = await transaction(async (client) => {
      const existingResult = await client.query(
        `SELECT retailer_alias_id, alias_name, alias_type, confidence, is_active, notes
         FROM retailer_aliases
         WHERE retailer_id = $1 AND retailer_alias_id = $2`,
        [retailerId, numericAliasId]
      )

      if (existingResult.rowCount === 0) {
        throw new Error('Retailer alias not found')
      }

      const existing = existingResult.rows[0]
      const aliasName = body.alias_name?.trim() || existing.alias_name
      const aliasType = body.alias_type ?? existing.alias_type
      if (!isRetailerAliasType(aliasType)) {
        throw new Error('alias_type is invalid.')
      }

      const updatedResult = await client.query<RetailerAliasRow>(
        `UPDATE retailer_aliases
         SET alias_name = $3,
             alias_name_normalized = $4,
             alias_type = $5,
             confidence = $6,
             is_active = $7,
             notes = $8,
             updated_at = NOW()
         WHERE retailer_id = $1 AND retailer_alias_id = $2
         RETURNING retailer_alias_id, retailer_id, alias_name, alias_name_normalized, alias_type, source,
           confidence::text, is_active, notes, created_at::text, updated_at::text`,
        [
          retailerId,
          numericAliasId,
          aliasName,
          normalizeBrandCatalogValue(aliasName),
          aliasType,
          body.confidence !== undefined ? confidence : existing.confidence,
          body.is_active ?? existing.is_active,
          body.notes?.trim() ?? existing.notes,
        ]
      )

      return updatedResult.rows[0]
    })

    return NextResponse.json({ alias: formatAlias(updated) })
  } catch (error) {
    console.error('Update retailer alias error:', error)

    if (error instanceof Error && (
      error.message === 'Retailer alias not found' ||
      error.message === 'alias_type is invalid.' ||
      error.message === 'confidence must be a number between 0 and 1, or null.'
    )) {
      const status = error.message === 'Retailer alias not found' ? 404 : 400
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    const { retailerId, aliasId } = await params
    const numericAliasId = Number(aliasId)
    if (!Number.isInteger(numericAliasId) || numericAliasId <= 0) {
      return NextResponse.json({ error: 'aliasId must be a positive integer.' }, { status: 400 })
    }

    await transaction(async (client) => {
      const result = await client.query(
        `DELETE FROM retailer_aliases
         WHERE retailer_id = $1 AND retailer_alias_id = $2`,
        [retailerId, numericAliasId]
      )

      if (result.rowCount === 0) {
        throw new Error('Retailer alias not found')
      }
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Delete retailer alias error:', error)

    if (error instanceof Error && error.message === 'Retailer alias not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}