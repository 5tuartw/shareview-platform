import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query, transaction } from '@/lib/db'
import {
  BRAND_CATALOG_MIGRATION_VERSION,
  type BrandType,
  getRetailerRelationshipType,
  hasBrandCatalogTables,
  isBrandType,
  normalizeBrandCatalogValue,
  slugifyBrandCatalogValue,
} from '@/lib/brand-catalog'

type Params = {
  retailerId: string
}

type RetailerRow = {
  retailer_id: string
  retailer_name: string
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

type CreateRetailerBrandBody = {
  canonical_name?: string
  brand_type?: BrandType
  brand_type_retailer_id?: string | null
  source_alias_name?: string | null
  latest_doc_count?: number | null
  is_current?: boolean
}

const STAFF_MANUAL_SOURCE = 'staff-manual'

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

const resolveBrandType = (
  brandType: unknown,
  brandTypeRetailerId: unknown,
  fallbackRetailerId: string,
): { brandType: BrandType; brandTypeRetailerId: string | null } => {
  if (brandType === undefined || brandType === null || brandType === '') {
    return { brandType: '3rd_party', brandTypeRetailerId: null }
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

export async function GET(
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

    const { retailerId } = await params
    const url = new URL(request.url)
    const requestedLimit = Number(url.searchParams.get('limit') ?? '25')
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
      : 25
    const currentOnlyParam = url.searchParams.get('currentOnly')
    const currentOnly = currentOnlyParam === null ? true : currentOnlyParam !== 'false'

    const retailerResult = await query<RetailerRow>(
      `SELECT retailer_id, retailer_name
       FROM retailers
       WHERE retailer_id = $1`,
      [retailerId]
    )

    if (retailerResult.rowCount === 0) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

    const brandLinksResult = await query<BrandLinkRow>(
      `SELECT
         b.brand_id,
         b.canonical_name,
         b.slug,
         b.brand_type,
         b.brand_type_retailer_id,
         owner_retailer.retailer_name AS brand_type_retailer_name,
         rbp.source,
         ba.alias_name AS source_alias_name,
         rbp.latest_doc_count,
         rbp.first_seen_at::text,
         rbp.last_seen_at::text,
         rbp.is_current
       FROM retailer_brand_presence rbp
       INNER JOIN brands b ON b.brand_id = rbp.brand_id
       LEFT JOIN brand_aliases ba ON ba.brand_alias_id = rbp.source_brand_alias_id
       LEFT JOIN retailers owner_retailer ON owner_retailer.retailer_id = b.brand_type_retailer_id
       WHERE rbp.retailer_id = $1
         AND ($2::boolean = false OR rbp.is_current = true)
       ORDER BY
         rbp.is_current DESC,
         rbp.latest_doc_count DESC NULLS LAST,
         b.canonical_name ASC
       LIMIT $3`,
      [retailerId, currentOnly, limit]
    )

    const summaryResult = await query<{
      total_brand_links: number
      current_brand_links: number
      last_seen_at: string | null
    }>(
      `SELECT
         COUNT(*)::int AS total_brand_links,
         COUNT(*) FILTER (WHERE is_current = true)::int AS current_brand_links,
         MAX(last_seen_at)::text AS last_seen_at
       FROM retailer_brand_presence
       WHERE retailer_id = $1`,
      [retailerId]
    )

    const summary = summaryResult.rows[0] ?? {
      total_brand_links: 0,
      current_brand_links: 0,
      last_seen_at: null,
    }

    return NextResponse.json({
      retailer_id: retailerResult.rows[0].retailer_id,
      retailer_name: retailerResult.rows[0].retailer_name,
      summary: {
        total_brand_links: summary.total_brand_links,
        current_brand_links: summary.current_brand_links,
        returned_brand_links: brandLinksResult.rows.length,
        last_seen_at: summary.last_seen_at,
        current_only: currentOnly,
        limit,
      },
      brands: brandLinksResult.rows.map((row) => formatBrandLink(row, retailerId)),
    })
  } catch (error) {
    console.error('Get retailer brands error:', error)
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

    const { retailerId } = await params
    const body = (await request.json()) as CreateRetailerBrandBody
    const canonicalName = body.canonical_name?.trim()

    if (!canonicalName) {
      return NextResponse.json({ error: 'canonical_name is required.' }, { status: 400 })
    }

    const latestDocCount = parseDocCount(body.latest_doc_count)
    const isCurrent = body.is_current !== false
    const sourceAliasName = body.source_alias_name?.trim() || canonicalName
    const { brandType, brandTypeRetailerId } = resolveBrandType(
      body.brand_type,
      body.brand_type_retailer_id,
      retailerId,
    )

    const created = await transaction(async (client) => {
      const retailerResult = await client.query<{ retailer_id: string; retailer_name: string }>(
        `SELECT retailer_id, retailer_name
         FROM retailers
         WHERE retailer_id = $1`,
        [retailerId]
      )

      if (retailerResult.rowCount === 0) {
        throw new Error('Retailer not found')
      }

      if (brandTypeRetailerId) {
        const ownerRetailerResult = await client.query(
          `SELECT 1 FROM retailers WHERE retailer_id = $1`,
          [brandTypeRetailerId]
        )

        if (ownerRetailerResult.rowCount === 0) {
          throw new Error('brand_type_retailer_id must reference an existing retailer.')
        }
      }

      const brandResult = await client.query<{ brand_id: number }>(
        `INSERT INTO brands (canonical_name, canonical_name_normalized, slug, brand_type, brand_type_retailer_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (canonical_name_normalized)
         DO UPDATE SET
           canonical_name = EXCLUDED.canonical_name,
           slug = EXCLUDED.slug,
           brand_type = EXCLUDED.brand_type,
           brand_type_retailer_id = EXCLUDED.brand_type_retailer_id,
           updated_at = NOW()
         RETURNING brand_id`,
        [
          canonicalName,
          normalizeBrandCatalogValue(canonicalName),
          slugifyBrandCatalogValue(canonicalName),
          brandType,
          brandTypeRetailerId,
        ]
      )

      const brandId = brandResult.rows[0].brand_id

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
        [brandId, sourceAliasName, normalizeBrandCatalogValue(sourceAliasName), STAFF_MANUAL_SOURCE, 1]
      )

      const brandAliasId = aliasResult.rows[0].brand_alias_id

      const linkResult = await client.query<BrandLinkRow>(
        `INSERT INTO retailer_brand_presence (
           retailer_id,
           brand_id,
           source,
           source_brand_alias_id,
           first_seen_at,
           last_seen_at,
           latest_doc_count,
           is_current,
           metadata,
           created_at,
           updated_at
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           NOW(),
           NOW(),
           $5,
           $6,
           jsonb_build_object('created_by', 'staff', 'created_from', 'manage-retailers'),
           NOW(),
           NOW()
         )
         ON CONFLICT (retailer_id, brand_id, source)
         DO UPDATE SET
           source_brand_alias_id = EXCLUDED.source_brand_alias_id,
           last_seen_at = NOW(),
           latest_doc_count = EXCLUDED.latest_doc_count,
           is_current = EXCLUDED.is_current,
           updated_at = NOW()
         RETURNING brand_id, source, latest_doc_count, first_seen_at::text, last_seen_at::text, is_current,
           (SELECT canonical_name FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS canonical_name,
           (SELECT slug FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS slug,
           (SELECT brand_type FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS brand_type,
           (SELECT brand_type_retailer_id FROM brands WHERE brand_id = retailer_brand_presence.brand_id) AS brand_type_retailer_id,
           (SELECT r.retailer_name FROM retailers r WHERE r.retailer_id = (SELECT brand_type_retailer_id FROM brands WHERE brand_id = retailer_brand_presence.brand_id)) AS brand_type_retailer_name,
           (SELECT alias_name FROM brand_aliases WHERE brand_alias_id = retailer_brand_presence.source_brand_alias_id) AS source_alias_name`,
        [retailerId, brandId, STAFF_MANUAL_SOURCE, brandAliasId, latestDocCount, isCurrent]
      )

      return {
        retailer: retailerResult.rows[0],
        brandLink: linkResult.rows[0],
      }
    })

    return NextResponse.json(
      {
        retailer_id: created.retailer.retailer_id,
        retailer_name: created.retailer.retailer_name,
        brand: formatBrandLink(created.brandLink, retailerId),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create retailer brand error:', error)

    if (error instanceof Error && error.message === 'Retailer not found') {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

    if (error instanceof Error && (
      error.message === 'latest_doc_count must be a non-negative number or null.' ||
      error.message === 'brand_type_retailer_id must reference an existing retailer.' ||
      error.message === 'brand_type must be one of 3rd_party, retailer_exclusive, or retailer_owned.'
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}