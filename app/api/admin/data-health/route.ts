// Data Health API Route
// GET /api/admin/data-health - Returns per-retailer, per-domain health status
// Uses the same sources as the dashboard RAG dots:
//   - retailer_snapshot_health for keywords, categories, products, auctions
//   - domain_metrics / retailer_data_availability for overview
//   - auction_insights direct query for auction period

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

interface DomainHealth {
  status: string | null
  last_successful_at: string | null
  last_successful_period: string | null
  record_count: number
}

interface RetailerHealth {
  retailer_id: string
  retailer_name: string
  status: string
  data_activity_status: string
  snapshot_enabled: boolean
  overview: DomainHealth | null
  keywords: DomainHealth | null
  categories: DomainHealth | null
  products: DomainHealth | null
  auctions: DomainHealth | null
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || !['SALES_TEAM', 'CSS_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
    }

    // Check which tables exist
    const tableCheck = await query<{
      has_retailer_data_availability: boolean
      has_domain_metrics: boolean
      has_auction_insights: boolean
      has_retailer_snapshot_health: boolean
    }>(`
      SELECT
        to_regclass('public.retailer_data_availability') IS NOT NULL AS has_retailer_data_availability,
        to_regclass('public.domain_metrics') IS NOT NULL AS has_domain_metrics,
        to_regclass('public.auction_insights') IS NOT NULL AS has_auction_insights,
        to_regclass('public.retailer_snapshot_health') IS NOT NULL AS has_retailer_snapshot_health
    `)
    const t = tableCheck.rows[0]

    // Single query: for each active non-test retailer, gather health from all sources
    const result = await query<{
      retailer_id: string
      retailer_name: string
      status: string
      data_activity_status: string
      snapshot_enabled: boolean
      // snapshot_health domains (keywords, categories, products, auctions)
      sh_keywords_status: string | null
      sh_keywords_last_at: string | null
      sh_keywords_period: string | null
      sh_keywords_count: number | null
      sh_categories_status: string | null
      sh_categories_last_at: string | null
      sh_categories_period: string | null
      sh_categories_count: number | null
      sh_products_status: string | null
      sh_products_last_at: string | null
      sh_products_period: string | null
      sh_products_count: number | null
      sh_auctions_status: string | null
      sh_auctions_last_at: string | null
      sh_auctions_period: string | null
      sh_auctions_count: number | null
      // overview from retailer_data_availability + domain_metrics
      overview_last_at: string | null
      overview_period: string | null
      overview_count: number | null
      // auction direct from auction_insights
      ai_latest_month: string | null
      ai_row_count: number | null
    }>(`
      SELECT
        r.retailer_id,
        r.retailer_name,
        COALESCE(r.status, 'active') AS status,
        COALESCE(r.data_activity_status, 'inactive') AS data_activity_status,
        COALESCE(r.snapshot_enabled, false) AS snapshot_enabled,
        ${t.has_retailer_snapshot_health ? `
        -- snapshot_health: keywords
        (SELECT status FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'keywords') AS sh_keywords_status,
        (SELECT last_successful_at FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'keywords') AS sh_keywords_last_at,
        (SELECT last_successful_period FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'keywords') AS sh_keywords_period,
        (SELECT record_count FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'keywords') AS sh_keywords_count,
        -- snapshot_health: categories
        (SELECT status FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'categories') AS sh_categories_status,
        (SELECT last_successful_at FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'categories') AS sh_categories_last_at,
        (SELECT last_successful_period FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'categories') AS sh_categories_period,
        (SELECT record_count FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'categories') AS sh_categories_count,
        -- snapshot_health: products
        (SELECT status FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'products') AS sh_products_status,
        (SELECT last_successful_at FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'products') AS sh_products_last_at,
        (SELECT last_successful_period FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'products') AS sh_products_period,
        (SELECT record_count FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'products') AS sh_products_count,
        -- snapshot_health: auctions
        (SELECT status FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'auctions') AS sh_auctions_status,
        (SELECT last_successful_at FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'auctions') AS sh_auctions_last_at,
        (SELECT last_successful_period FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'auctions') AS sh_auctions_period,
        (SELECT record_count FROM retailer_snapshot_health WHERE retailer_id = r.retailer_id AND snapshot_type = 'auctions') AS sh_auctions_count,
        ` : `
        NULL AS sh_keywords_status, NULL AS sh_keywords_last_at, NULL AS sh_keywords_period, NULL::int AS sh_keywords_count,
        NULL AS sh_categories_status, NULL AS sh_categories_last_at, NULL AS sh_categories_period, NULL::int AS sh_categories_count,
        NULL AS sh_products_status, NULL AS sh_products_last_at, NULL AS sh_products_period, NULL::int AS sh_products_count,
        NULL AS sh_auctions_status, NULL AS sh_auctions_last_at, NULL AS sh_auctions_period, NULL::int AS sh_auctions_count,
        `}
        ${t.has_retailer_data_availability || t.has_domain_metrics ? `
        -- overview: COALESCE retailer_data_availability + domain_metrics
        COALESCE(
          ${t.has_retailer_data_availability ? `(SELECT MAX(updated_at) FROM retailer_data_availability WHERE retailer_id = r.retailer_id AND domain = 'overview')` : 'NULL'},
          ${t.has_domain_metrics ? `(SELECT MAX(calculated_at) FROM domain_metrics WHERE retailer_id = r.retailer_id AND is_active = true AND page_type = 'overview' AND tab_name = 'overview')` : 'NULL'}
        )::text AS overview_last_at,
        COALESCE(
          ${t.has_retailer_data_availability ? `(SELECT MAX(period) FILTER (WHERE granularity = 'month') FROM retailer_data_availability WHERE retailer_id = r.retailer_id AND domain = 'overview')` : 'NULL'},
          ${t.has_domain_metrics ? `(SELECT TO_CHAR(MAX(period_start), 'YYYY-MM') FROM domain_metrics WHERE retailer_id = r.retailer_id AND is_active = true AND page_type = 'overview' AND tab_name = 'overview')` : 'NULL'}
        ) AS overview_period,
        COALESCE(
          ${t.has_retailer_data_availability ? `(SELECT COUNT(*)::int FROM retailer_data_availability WHERE retailer_id = r.retailer_id AND domain = 'overview')` : '0'},
          0
        ) AS overview_count,
        ` : `
        NULL AS overview_last_at,
        NULL AS overview_period,
        0 AS overview_count,
        `}
        ${t.has_auction_insights ? `
        -- auction_insights direct: latest month with data
        (SELECT to_char(MAX(month), 'YYYY-MM') FROM auction_insights WHERE retailer_id = r.retailer_id AND preferred_for_display = true) AS ai_latest_month,
        (SELECT COUNT(*)::int FROM auction_insights WHERE retailer_id = r.retailer_id AND preferred_for_display = true) AS ai_row_count
        ` : `
        NULL AS ai_latest_month,
        0::int AS ai_row_count
        `}
      FROM retailers r
      WHERE r.status = 'active'
        AND r.is_test_account = false
      ORDER BY r.retailer_name
    `)

    // Assemble per-retailer health objects
    const retailers: RetailerHealth[] = result.rows.map(row => {
      const mkDomain = (
        status: string | null,
        lastAt: string | null,
        period: string | null,
        count: number | null
      ): DomainHealth | null => {
        if (!status && !lastAt && !period) return null
        return {
          status,
          last_successful_at: lastAt,
          last_successful_period: period,
          record_count: count ?? 0,
        }
      }

      // For auctions: prefer auction_insights direct month over snapshot_health period
      const auctionPeriod = row.ai_latest_month ?? row.sh_auctions_period
      const auctionCount = (row.ai_row_count ?? 0) > 0 ? row.ai_row_count : row.sh_auctions_count

      return {
        retailer_id: row.retailer_id,
        retailer_name: row.retailer_name,
        status: row.status,
        data_activity_status: row.data_activity_status,
        snapshot_enabled: row.snapshot_enabled,
        overview: row.overview_last_at || row.overview_period
          ? {
              status: row.overview_last_at ? 'ok' : null,
              last_successful_at: row.overview_last_at,
              last_successful_period: row.overview_period,
              record_count: row.overview_count ?? 0,
            }
          : null,
        keywords: mkDomain(row.sh_keywords_status, row.sh_keywords_last_at, row.sh_keywords_period, row.sh_keywords_count),
        categories: mkDomain(row.sh_categories_status, row.sh_categories_last_at, row.sh_categories_period, row.sh_categories_count),
        products: mkDomain(row.sh_products_status, row.sh_products_last_at, row.sh_products_period, row.sh_products_count),
        auctions: (auctionPeriod || row.sh_auctions_status)
          ? {
              status: row.sh_auctions_status ?? (auctionPeriod ? 'ok' : null),
              last_successful_at: row.sh_auctions_last_at,
              last_successful_period: auctionPeriod,
              record_count: auctionCount ?? 0,
            }
          : null,
      }
    })

    return NextResponse.json(retailers)
  } catch (error) {
    console.error('Error fetching data health:', error)
    return NextResponse.json(
      { error: 'Failed to fetch data health' },
      { status: 500 }
    )
  }
}
