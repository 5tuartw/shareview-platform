import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import {
  BRAND_CATALOG_MIGRATION_VERSION,
  type BrandType,
  getRetailerRelationshipType,
  hasBrandCatalogTables,
  isBrandType,
  normalizeBrandCatalogValue,
  slugifyBrandCatalogValue,
} from '@/lib/brand-catalog'
import { transaction } from '@/lib/db'

type Params = {
  retailerId: string
  brandId: string
}

type UpdateRetailerBrandBody = {
  canonical_name?: string
  brand_type?: BrandType
  brand_type_retailer_id?: string | null
  source_alias_name?: string | null
  latest_doc_count?: number | null
  is_current?: boolean
}

type BrandLinkRow = {
  brand_id: number
  canonical_name: string
  slug: string
  brand_type: BrandType
  brand_type_retailer_id: string | null
  brand_type_retailer_name: string | null
  source: string
  source_alias_name: string | null
  latest_doc_count: number | null
  first_seen_at: string | null
  last_seen_at: string | null
  is_current: boolean
}

const parseDocCount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('latest_doc_count must be a non-negative number or null.')
  }

  return Math.trunc(value)
}

const formatBrandLink = (row: BrandLinkRow, retailerId: string) => ({
  brand_id: row.brand_id,
  canonical_name: row.canonical_name,
  slug: row.slug,
  brand_type: row.brand_type,
  brand_type_retailer_id: row.brand_type_retailer_id,
  brand_type_retailer_name: row.brand_type_retailer_name,
  relationship_type: getRetailerRelationshipType(
    row.brand_type,
    row.brand_type_retailer_id,
    retailerId,
  ),
  source: row.source,
  source_alias_name: row.source_alias_name,
  latest_doc_count: row.latest_doc_count,
  first_seen_at: row.first_seen_at,
  last_seen_at: row.last_seen_at,
  is_current: row.is_current,
})

const getSourceParam = (request: Request): string => {
  const source = new URL(request.url).searchParams.get('source')?.trim()
  if (!source) {
    throw new Error('source query parameter is required.')
  }
  return source
}

const resolveBrandType = (
  brandType: unknown,
  brandTypeRetailerId: unknown,
  fallbackRetailerId: string,
): { brandType?: BrandType; brandTypeRetailerId?: string | null } => {
  if (brandType === undefined) {
    return {}
  }

  if (!isBrandType(brandType)) {
    throw new Error('brand_type must be one of 3rd_party, retailer_exclusive, or retailer_owned.')
  }

  if (brandType === '3rd_party') {
    return { brandType, brandTypeRetailerId: null }
  }

  if (typeof brandTypeRetailerId === 'string' && brandTypeRetailerId.trim()) {
    return { brandType, brandTypeRetailerId: brandTypeRetailerId.trim() }
  }

  return { brandType, brandTypeRetailerId: fallbackRetailerId }
}

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
      return NextResponse.json(
        { error: 'Forbidden: Staff or Super Admin role required' },
        { status: 403 }
      )
    }

    const tablesReady = await hasBrandCatalogTables()
    if (!tablesReady) {
      return NextResponse.json(
        { error: `Brand catalog tables are missing. Run migration ${BRAND_CATALOG_MIGRATION_VERSION} first.` },
        { status: 409 }
      )
    }

    const source = getSourceParam(request)
    const { retailerId, brandId } = await params
    const numericBrandId = Number(brandId)

    if (!Number.isInteger(numericBrandId) || numericBrandId <= 0) {
      return NextResponse.json({ error: 'brandId must be a positive integer.' }, { status: 400 })
    }

    const body = (await request.json()) as UpdateRetailerBrandBody
    const canonicalName = body.canonical_name?.trim()
    const sourceAliasName = body.source_alias_name?.trim()
    const latestDocCount = parseDocCount(body.latest_doc_count)
    const brandTypeUpdate = resolveBrandType(
      body.brand_type,
      body.brand_type_retailer_id,
      retailerId,
    )

    const updated = await transaction(async (client) => {
      const existingResult = await client.query<{
        retailer_id: string
        brand_id: number
        source: string
        source_brand_alias_id: number | null
      }>(
        `SELECT retailer_id, brand_id, source, source_brand_alias_id
         FROM retailer_brand_presence
         WHERE retailer_id = $1 AND brand_id = $2 AND source = $3`,
        [retailerId, numericBrandId, source]
      )

      if (existingResult.rowCount === 0) {
        throw new Error('Retailer brand link not found')
      }

      if (brandTypeUpdate.brandTypeRetailerId) {
        const ownerRetailerResult = await client.query(
          `SELECT 1 FROM retailers WHERE retailer_id = $1`,
          [brandTypeUpdate.brandTypeRetailerId]
        )

        if (ownerRetailerResult.rowCount === 0) {
          throw new Error('brand_type_retailer_id must reference an existing retailer.')
        }
      }

      if (canonicalName || brandTypeUpdate.brandType !== undefined) {
        const currentBrandResult = await client.query<{
          canonical_name: string
          brand_type: BrandType
          brand_type_retailer_id: string | null
        }>(
          `SELECT canonical_name, brand_type, brand_type_retailer_id
           FROM brands
           WHERE brand_id = $1`,
          [numericBrandId]
        )

        const currentBrand = currentBrandResult.rows[0]
        await client.query(
          `UPDATE brands
           SET canonical_name = $2,
               canonical_name_normalized = $3,
               slug = $4,
               brand_type = $5,
               brand_type_retailer_id = $6,
               updated_at = NOW()
           WHERE brand_id = $1`,
          [
            numericBrandId,
            canonicalName ?? currentBrand.canonical_name,
            normalizeBrandCatalogValue(canonicalName ?? currentBrand.canonical_name),
            slugifyBrandCatalogValue(canonicalName ?? currentBrand.canonical_name),
            brandTypeUpdate.brandType ?? currentBrand.brand_type,
            brandTypeUpdate.brandType !== undefined
              ? brandTypeUpdate.brandTypeRetailerId ?? null
              : currentBrand.brand_type_retailer_id,
          ]
        )
      }

      let sourceBrandAliasId = existingResult.rows[0].source_brand_alias_id
      if (sourceAliasName) {
        const aliasResult = await client.query<{ brand_alias_id: number }>(
          `INSERT INTO brand_aliases (brand_id, alias_name, alias_name_normalized, source, confidence)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (source, alias_name_normalized)
           DO UPDATE SET
             brand_id = EXCLUDED.brand_id,
             alias_name = EXCLUDED.alias_name,
             confidence = EXCLUDED.confidence,
             updated_at = NOW()
           RETURNING brand_alias_id`,
          [numericBrandId, sourceAliasName, normalizeBrandCatalogValue(sourceAliasName), source, 1]
        )
        sourceBrandAliasId = aliasResult.rows[0].brand_alias_id
      }

      const sets: string[] = ['updated_at = NOW()', 'last_seen_at = NOW()']
      const values: Array<string | number | boolean | null> = [retailerId, numericBrandId, source]
      let idx = 4

      if (sourceAliasName) {
        sets.push(`source_brand_alias_id = $${idx++}`)
        values.push(sourceBrandAliasId)
      }
      if (body.latest_doc_count !== undefined) {
        sets.push(`latest_doc_count = $${idx++}`)
        values.push(latestDocCount)
      }
      if (typeof body.is_current === 'boolean') {
        sets.push(`is_current = $${idx++}`)
        values.push(body.is_current)
      }

      const updatedResult = await client.query<BrandLinkRow>(
        `UPDATE retailer_brand_presence
         SET ${sets.join(', ')}
         WHERE retailer_id = $1 AND brand_id = $2 AND source = $3
         RETURNING brand_id, source, latest_doc_count, first_seen_at::text, last_seen_at::text, is_current,
           (SELECT canonical_name FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS canonical_name,
           (SELECT slug FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS slug,
           (SELECT brand_type FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS brand_type,
           (SELECT brand_type_retailer_id FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS brand_type_retailer_id,
           (SELECT r.retailer_name FROM retailers r WHERE r.retailer_id = (SELECT brand_type_retailer_id FROM brands WHERE brand_id = retailer_brand_presence.brand_id)) AS brand_type_retailer_name,
           (SELECT alias_name FROM brand_aliases WHERE brand_alias_id = retailer_brand_presence.source_brand_alias_id) AS source_alias_name`,
        values
      )

      return updatedResult.rows[0]
    })

    return NextResponse.json({ brand: formatBrandLink(updated, retailerId) })
  } catch (error) {
    console.error('Update retailer brand error:', error)

    if (error instanceof Error && (
      error.message === 'source query parameter is required.' ||
      error.message === 'latest_doc_count must be a non-negative number or null.' ||
      error.message === 'brand_type_retailer_id must reference an existing retailer.' ||
      error.message === 'brand_type must be one of 3rd_party, retailer_exclusive, or retailer_owned.'
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'Retailer brand link not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    if (error instanceof Error && error.message.includes('brands_canonical_name_normalized_unique')) {
      return NextResponse.json({ error: 'A canonical brand with that normalized name already exists.' }, { status: 409 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: Staff or Super Admin role required' },
        { status: 403 }
      )
    }

    const tablesReady = await hasBrandCatalogTables()
    if (!tablesReady) {
      return NextResponse.json(
        { error: `Brand catalog tables are missing. Run migration ${BRAND_CATALOG_MIGRATION_VERSION} first.` },
        { status: 409 }
      )
    }

    const source = getSourceParam(request)
    const { retailerId, brandId } = await params
    const numericBrandId = Number(brandId)

    if (!Number.isInteger(numericBrandId) || numericBrandId <= 0) {
      return NextResponse.json({ error: 'brandId must be a positive integer.' }, { status: 400 })
    }

    await transaction(async (client) => {
      const existingResult = await client.query<{ source_brand_alias_id: number | null }>(
        `SELECT source_brand_alias_id
         FROM retailer_brand_presence
         WHERE retailer_id = $1 AND brand_id = $2 AND source = $3`,
        [retailerId, numericBrandId, source]
      )

      if (existingResult.rowCount === 0) {
        throw new Error('Retailer brand link not found')
      }

      const sourceBrandAliasId = existingResult.rows[0].source_brand_alias_id

      await client.query(
        `DELETE FROM retailer_brand_presence
         WHERE retailer_id = $1 AND brand_id = $2 AND source = $3`,
        [retailerId, numericBrandId, source]
      )

      if (sourceBrandAliasId) {
        await client.query(
          `DELETE FROM brand_aliases
           WHERE brand_alias_id = $1
             AND NOT EXISTS (
               SELECT 1
               FROM retailer_brand_presence
               WHERE source_brand_alias_id = $1
             )`,
          [sourceBrandAliasId]
        )
      }

      await client.query(
        `DELETE FROM brands
         WHERE brand_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM retailer_brand_presence WHERE brand_id = $1
           )
           AND NOT EXISTS (
             SELECT 1 FROM brand_aliases WHERE brand_id = $1
           )`,
        [numericBrandId]
      )
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Delete retailer brand error:', error)

    if (error instanceof Error && error.message === 'source query parameter is required.') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'Retailer brand link not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}