import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { transaction } from '@/lib/db'
import { hasActiveRole } from '@/lib/permissions'
import { normalizeBrandCatalogValue } from '@/lib/brand-catalog'

type Params = {
  brandId: string
  aliasId: string
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

type UpdateBrandAliasBody = {
  alias_name?: string
  confidence?: number | null
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

    const { brandId, aliasId } = await params
    const numericBrandId = Number(brandId)
    const numericAliasId = Number(aliasId)
    if (!Number.isInteger(numericBrandId) || numericBrandId <= 0 || !Number.isInteger(numericAliasId) || numericAliasId <= 0) {
      return NextResponse.json({ error: 'brandId and aliasId must be positive integers.' }, { status: 400 })
    }

    const body = (await request.json()) as UpdateBrandAliasBody
    const confidence = parseConfidence(body.confidence)

    const updated = await transaction(async (client) => {
      const existingResult = await client.query(
        `SELECT alias_name, confidence
         FROM brand_aliases
         WHERE brand_id = $1 AND brand_alias_id = $2`,
        [numericBrandId, numericAliasId]
      )

      if (existingResult.rowCount === 0) {
        throw new Error('Brand alias not found')
      }

      const existing = existingResult.rows[0]
      const aliasName = body.alias_name?.trim() || existing.alias_name

      const updatedResult = await client.query<BrandAliasRow>(
        `UPDATE brand_aliases
         SET alias_name = $3,
             alias_name_normalized = $4,
             confidence = $5,
             updated_at = NOW()
         WHERE brand_id = $1 AND brand_alias_id = $2
         RETURNING brand_alias_id, brand_id, alias_name, alias_name_normalized, source,
           confidence::text, created_at::text, updated_at::text`,
        [
          numericBrandId,
          numericAliasId,
          aliasName,
          normalizeBrandCatalogValue(aliasName),
          body.confidence !== undefined ? confidence : existing.confidence,
        ]
      )

      return updatedResult.rows[0]
    })

    return NextResponse.json({ alias: formatAlias(updated) })
  } catch (error) {
    console.error('Update brand alias error:', error)

    if (error instanceof Error && (
      error.message === 'Brand alias not found' ||
      error.message === 'confidence must be a number between 0 and 1, or null.'
    )) {
      const status = error.message === 'Brand alias not found' ? 404 : 400
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

    const { brandId, aliasId } = await params
    const numericBrandId = Number(brandId)
    const numericAliasId = Number(aliasId)
    if (!Number.isInteger(numericBrandId) || numericBrandId <= 0 || !Number.isInteger(numericAliasId) || numericAliasId <= 0) {
      return NextResponse.json({ error: 'brandId and aliasId must be positive integers.' }, { status: 400 })
    }

    await transaction(async (client) => {
      const existingResult = await client.query(
        `SELECT 1 FROM brand_aliases WHERE brand_id = $1 AND brand_alias_id = $2`,
        [numericBrandId, numericAliasId]
      )

      if (existingResult.rowCount === 0) {
        throw new Error('Brand alias not found')
      }

      await client.query(
        `UPDATE retailer_brand_presence
         SET source_brand_alias_id = NULL,
             updated_at = NOW()
         WHERE source_brand_alias_id = $1`,
        [numericAliasId]
      )

      await client.query(
        `DELETE FROM brand_aliases
         WHERE brand_id = $1 AND brand_alias_id = $2`,
        [numericBrandId, numericAliasId]
      )
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Delete brand alias error:', error)

    if (error instanceof Error && error.message === 'Brand alias not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}