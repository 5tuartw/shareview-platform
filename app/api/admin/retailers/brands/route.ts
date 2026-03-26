import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import {
  BRAND_CATALOG_MIGRATION_VERSION,
  type BrandType,
  getRetailerRelationshipType,
  hasBrandCatalogTables,
} from '@/lib/brand-catalog'

type RetailerBrandSummaryRow = {
  retailer_id: string
  retailer_name: string
  current_brand_links: number
  total_brand_links: number
  last_seen_at: string | null
  top_brands: Array<{
    brand_id: number
    canonical_name: string
    slug: string
    latest_doc_count: number | null
    brand_type: BrandType
    brand_type_retailer_id: string | null
    relationship_type?: BrandType
  }> | null
}

export async function GET(request: Request) {
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

    const url = new URL(request.url)
    const requestedTopBrandsLimit = Number(url.searchParams.get('topBrandsLimit') ?? '3')
    const topBrandsLimit = Number.isFinite(requestedTopBrandsLimit)
      ? Math.min(Math.max(Math.trunc(requestedTopBrandsLimit), 1), 20)
      : 3
    const currentOnlyParam = url.searchParams.get('currentOnly')
    const currentOnly = currentOnlyParam === null ? true : currentOnlyParam !== 'false'

    const result = await query<RetailerBrandSummaryRow>(
      `WITH filtered_links AS (
         SELECT *
         FROM retailer_brand_presence
         WHERE ($1::boolean = false OR is_current = true)
       ),
       retailer_counts AS (
         SELECT
           rbp.retailer_id,
           COUNT(*) FILTER (WHERE rbp.is_current = true)::int AS current_brand_links,
           COUNT(*)::int AS total_brand_links,
           MAX(rbp.last_seen_at)::text AS last_seen_at
         FROM retailer_brand_presence rbp
         GROUP BY rbp.retailer_id
       ),
       ranked_links AS (
         SELECT
           fl.retailer_id,
           b.brand_id,
           b.canonical_name,
           b.slug,
           b.brand_type,
           b.brand_type_retailer_id,
           fl.latest_doc_count,
           ROW_NUMBER() OVER (
             PARTITION BY fl.retailer_id
             ORDER BY fl.latest_doc_count DESC NULLS LAST, b.canonical_name ASC
           ) AS brand_rank
         FROM filtered_links fl
         INNER JOIN brands b ON b.brand_id = fl.brand_id
       )
       SELECT
         r.retailer_id,
         r.retailer_name,
         COALESCE(rc.current_brand_links, 0)::int AS current_brand_links,
         COALESCE(rc.total_brand_links, 0)::int AS total_brand_links,
         rc.last_seen_at,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'brand_id', rl.brand_id,
               'canonical_name', rl.canonical_name,
               'slug', rl.slug,
               'latest_doc_count', rl.latest_doc_count,
               'brand_type', rl.brand_type,
               'brand_type_retailer_id', rl.brand_type_retailer_id
             )
             ORDER BY rl.brand_rank
           ) FILTER (WHERE rl.brand_id IS NOT NULL),
           '[]'::jsonb
         ) AS top_brands
       FROM retailers r
       LEFT JOIN retailer_counts rc ON rc.retailer_id = r.retailer_id
       LEFT JOIN ranked_links rl
         ON rl.retailer_id = r.retailer_id
        AND rl.brand_rank <= $2
       GROUP BY r.retailer_id, r.retailer_name, rc.current_brand_links, rc.total_brand_links, rc.last_seen_at
       ORDER BY r.retailer_name ASC`,
      [currentOnly, topBrandsLimit]
    )

    const retailers = result.rows.map((row) => ({
      ...row,
      top_brands: (row.top_brands ?? []).map((brand) => ({
        ...brand,
        relationship_type: getRetailerRelationshipType(
          brand.brand_type,
          brand.brand_type_retailer_id,
          row.retailer_id,
        ),
      })),
    }))

    return NextResponse.json({
      current_only: currentOnly,
      top_brands_limit: topBrandsLimit,
      retailers,
    })
  } catch (error) {
    console.error('Get retailer brand summaries error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}