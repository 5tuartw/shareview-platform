import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, transaction } from '@/lib/db'
import { hasActiveRole } from '@/lib/permissions'
import { normalizeBrandCatalogValue } from '@/lib/brand-catalog'

type Params = {
  brandId: string
}

type BrandAliasRow = {
  brand_alias_id: number
  brand_id: number
  alias_name: string
  alias_name_normalized: string
  source: string
  confidence: string | null
  created_at: string
  updated_at: string
}

type CreateBrandAliasBody = {
  alias_name?: string
  confidence?: number | null
}

const STAFF_MANUAL_SOURCE = 'staff-manual'

const parseConfidence = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('confidence must be a number between 0 and 1, or null.')
  }

  return value
}

const formatAlias = (row: BrandAliasRow) => ({
  brand_alias_id: row.brand_alias_id,
  brand_id: row.brand_id,
  alias_name: row.alias_name,
  alias_name_normalized: row.alias_name_normalized,
  source: row.source,
  confidence: row.confidence !== null ? Number(row.confidence) : null,
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

    const { brandId } = await params
    const numericBrandId = Number(brandId)
    if (!Number.isInteger(numericBrandId) || numericBrandId <= 0) {
      return NextResponse.json({ error: 'brandId must be a positive integer.' }, { status: 400 })
    }

    const brandResult = await query<{ brand_id: number; canonical_name: string }>(
      `SELECT brand_id, canonical_name FROM brands WHERE brand_id = $1`,
      [numericBrandId]
    )

    if (brandResult.rowCount === 0) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const aliasesResult = await query<BrandAliasRow>(
      `SELECT brand_alias_id, brand_id, alias_name, alias_name_normalized, source,
         confidence::text, created_at::text, updated_at::text
       FROM brand_aliases
       WHERE brand_id = $1
       ORDER BY alias_name ASC`,
      [numericBrandId]
    )

    return NextResponse.json({
      brand_id: brandResult.rows[0].brand_id,
      canonical_name: brandResult.rows[0].canonical_name,
      aliases: aliasesResult.rows.map(formatAlias),
    })
  } catch (error) {
    console.error('Get brand aliases error:', error)
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

    const { brandId } = await params
    const numericBrandId = Number(brandId)
    if (!Number.isInteger(numericBrandId) || numericBrandId <= 0) {
      return NextResponse.json({ error: 'brandId must be a positive integer.' }, { status: 400 })
    }

    const body = (await request.json()) as CreateBrandAliasBody
    const aliasName = body.alias_name?.trim()
    if (!aliasName) {
      return NextResponse.json({ error: 'alias_name is required.' }, { status: 400 })
    }

    const confidence = parseConfidence(body.confidence)
    const aliasNameNormalized = normalizeBrandCatalogValue(aliasName)

    const result = await transaction(async (client) => {
      const brandResult = await client.query<{ brand_id: number; canonical_name: string }>(
        `SELECT brand_id, canonical_name FROM brands WHERE brand_id = $1`,
        [numericBrandId]
      )

      if (brandResult.rowCount === 0) {
        throw new Error('Brand not found')
      }

      const aliasResult = await client.query<BrandAliasRow>(
        `INSERT INTO brand_aliases (
           brand_id,
           alias_name,
           alias_name_normalized,
           source,
           confidence,
           metadata,
           created_at,
           updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5,
           jsonb_build_object('created_by', 'staff', 'created_from', 'manage-retailers'),
           NOW(), NOW()
         )
         ON CONFLICT (source, alias_name_normalized)
         DO UPDATE SET
           brand_id = EXCLUDED.brand_id,
           alias_name = EXCLUDED.alias_name,
           confidence = EXCLUDED.confidence,
           updated_at = NOW()
         RETURNING brand_alias_id, brand_id, alias_name, alias_name_normalized, source,
           confidence::text, created_at::text, updated_at::text`,
        [numericBrandId, aliasName, aliasNameNormalized, STAFF_MANUAL_SOURCE, confidence]
      )

      return {
        brand: brandResult.rows[0],
        alias: aliasResult.rows[0],
      }
    })

    return NextResponse.json({
      brand_id: result.brand.brand_id,
      canonical_name: result.brand.canonical_name,
      alias: formatAlias(result.alias),
    }, { status: 201 })
  } catch (error) {
    console.error('Create brand alias error:', error)

    if (error instanceof Error && (
      error.message === 'Brand not found' ||
      error.message === 'confidence must be a number between 0 and 1, or null.'
    )) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Brand not found' ? 404 : 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}