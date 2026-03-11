import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import type { RetailerListItem } from '@/types'

type DashboardSummaryResponse = {
  retailers: RetailerListItem[]
  header: {
    auction_upload: {
      latest_month: string | null
    }
    market_profiles: {
      unassigned_count: number
      unconfirmed_count: number
    }
  }
}

type DashboardSession = {
  user: {
    role?: string
    retailerIds?: string[]
  }
}

async function getRetailers(session: DashboardSession) {
  const { role, retailerIds } = session.user

  const tableCheckResult = await query<{
    has_monthly_archive: boolean
    has_retailer_data_availability: boolean
    has_auction_insights: boolean
  }>(`
    SELECT
      to_regclass('public.monthly_archive') IS NOT NULL AS has_monthly_archive,
      to_regclass('public.retailer_data_availability') IS NOT NULL AS has_retailer_data_availability,
      to_regclass('public.auction_insights') IS NOT NULL AS has_auction_insights
  `)

  const tableAvailability = tableCheckResult.rows[0] ?? {
    has_monthly_archive: false,
    has_retailer_data_availability: false,
    has_auction_insights: false,
  }

  const overviewHealthLateral = tableAvailability.has_monthly_archive
    ? `
      LEFT JOIN LATERAL (
        SELECT
          MAX(fetch_datetime) AS last_successful_at,
          to_char(MAX(to_date(month_year, 'YYYY-MM')), 'YYYY-MM') AS last_successful_period,
          COUNT(*)::int AS record_count
        FROM monthly_archive
        WHERE retailer_id = COALESCE(
          (
            SELECT mapped.retailer_id
            FROM retailers mapped
            WHERE mapped.retailer_name = rm.retailer_name
              AND mapped.source_retailer_id IS NOT NULL
            ORDER BY COALESCE(mapped.snapshot_enabled, false) DESC, mapped.updated_at DESC
            LIMIT 1
          ),
          rm.retailer_id
        )
      ) overview_health ON TRUE
    `
    : tableAvailability.has_retailer_data_availability
      ? `
      LEFT JOIN LATERAL (
        SELECT
          MAX(updated_at) AS last_successful_at,
          MAX(period) FILTER (WHERE granularity = 'month') AS last_successful_period,
          COUNT(*)::int AS record_count
        FROM retailer_data_availability
        WHERE retailer_id = COALESCE(
          (
            SELECT mapped.retailer_id
            FROM retailers mapped
            WHERE mapped.retailer_name = rm.retailer_name
              AND mapped.source_retailer_id IS NOT NULL
            ORDER BY COALESCE(mapped.snapshot_enabled, false) DESC, mapped.updated_at DESC
            LIMIT 1
          ),
          rm.retailer_id
        )
          AND domain = 'overview'
      ) overview_health ON TRUE
    `
      : `
      LEFT JOIN LATERAL (
        SELECT
          NULL::timestamptz AS last_successful_at,
          NULL::text AS last_successful_period,
          0::int AS record_count
      ) overview_health ON TRUE
    `

  const auctionHealthLateral = tableAvailability.has_auction_insights
    ? `
      LEFT JOIN LATERAL (
        SELECT
          MAX(month_start)::timestamptz AS last_successful_at,
          to_char(MAX(month_start), 'YYYY-MM') AS last_successful_period,
          COUNT(*)::int AS record_count
        FROM (
          SELECT month AS month_start
          FROM auction_insights
          WHERE retailer_id = rm.retailer_id
            AND preferred_for_display = true
          UNION ALL
          SELECT range_start AS month_start
          FROM auction_insights_snapshots
          WHERE retailer_id = rm.retailer_id
            AND range_type = 'month'
        ) auction_months
      ) auction_health ON TRUE
    `
    : tableAvailability.has_retailer_data_availability
      ? `
      LEFT JOIN LATERAL (
        SELECT
          MAX(updated_at) AS last_successful_at,
          MAX(period) AS last_successful_period,
          COUNT(*)::int AS record_count
        FROM retailer_data_availability
        WHERE retailer_id = rm.retailer_id
          AND domain = 'auctions'
          AND granularity = 'month'
      ) auction_health ON TRUE
    `
      : `
      LEFT JOIN LATERAL (
        SELECT
          NULL::timestamptz AS last_successful_at,
          NULL::text AS last_successful_period,
          0::int AS record_count
      ) auction_health ON TRUE
    `

  let queryText: string
  let queryParams: Array<string[] | string | number> = []
  const isStaff = role === 'SALES_TEAM' || role === 'CSS_ADMIN'

  if (isStaff) {
    queryText = `
      SELECT
        rm.retailer_id,
        rm.retailer_name,
        COALESCE(rm.category, '') as category,
        COALESCE(rm.tier, '') as tier,
        COALESCE(rm.status, 'active') as status,
        COALESCE(rm.data_activity_status, 'inactive') as data_activity_status,
        rm.last_data_date::text as last_data_date,
        COALESCE(rm.snapshot_enabled, false) as is_enrolled,
        (
          COALESCE(rm.data_activity_status, 'inactive') = 'active'
          OR COALESCE(rm.last_data_date >= CURRENT_DATE - INTERVAL '3 months', false)
          OR COALESCE(rm.snapshot_enabled, false) = true
        ) as is_active_retailer,
        COALESCE(rm.account_manager, '') as account_manager,
        COALESCE(rm.high_priority, false) as high_priority,
        COALESCE(rm.is_demo, false) as is_demo,
        0 as alert_count,
        GREATEST(
          (SELECT MAX(last_updated) FROM keywords_snapshots             WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM category_performance_snapshots WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM product_performance_snapshots  WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM auction_insights_snapshots     WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM product_coverage_snapshots     WHERE retailer_id = rm.retailer_id)
        ) as latest_data_at,
        (
          COALESCE((
            SELECT jsonb_object_agg(
              snapshot_type,
              jsonb_build_object(
                'status',                  status,
                'last_attempted_at',       last_attempted_at,
                'last_successful_at',      last_successful_at,
                'last_successful_period',  last_successful_period,
                'record_count',            record_count
              )
            )
            FROM retailer_snapshot_health
            WHERE retailer_id = rm.retailer_id
          ), '{}'::jsonb)
          ||
          jsonb_build_object(
            'overview',
            jsonb_build_object(
              'status', CASE WHEN overview_health.last_successful_at IS NULL THEN 'unknown' ELSE 'ok' END,
              'last_successful_at', overview_health.last_successful_at,
              'last_successful_period', overview_health.last_successful_period,
              'record_count', overview_health.record_count
            ),
            'auctions',
            jsonb_build_object(
              'status', CASE WHEN auction_health.last_successful_period IS NULL THEN 'unknown' ELSE 'ok' END,
              'last_successful_at', auction_health.last_successful_at,
              'last_successful_period', auction_health.last_successful_period,
              'record_count', auction_health.record_count
            )
          )
        ) as snapshot_health
      FROM retailers rm
      ${overviewHealthLateral}
      ${auctionHealthLateral}
      ORDER BY rm.retailer_name
    `
  } else {
    if (!retailerIds || retailerIds.length === 0) return []

    queryText = `
      SELECT
        rm.retailer_id,
        rm.retailer_name,
        COALESCE(rm.category, '') as category,
        COALESCE(rm.tier, '') as tier,
        COALESCE(rm.status, 'active') as status,
        COALESCE(rm.data_activity_status, 'inactive') as data_activity_status,
        rm.last_data_date::text as last_data_date,
        COALESCE(rm.snapshot_enabled, false) as is_enrolled,
        (
          COALESCE(rm.data_activity_status, 'inactive') = 'active'
          OR COALESCE(rm.last_data_date >= CURRENT_DATE - INTERVAL '3 months', false)
          OR COALESCE(rm.snapshot_enabled, false) = true
        ) as is_active_retailer,
        COALESCE(rm.account_manager, '') as account_manager,
        COALESCE(rm.high_priority, false) as high_priority,
        COALESCE(rm.is_demo, false) as is_demo,
        0 as alert_count,
        GREATEST(
          (SELECT MAX(last_updated) FROM keywords_snapshots             WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM category_performance_snapshots WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM product_performance_snapshots  WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM auction_insights_snapshots     WHERE retailer_id = rm.retailer_id),
          (SELECT MAX(last_updated) FROM product_coverage_snapshots     WHERE retailer_id = rm.retailer_id)
        ) as latest_data_at,
        (
          COALESCE((
            SELECT jsonb_object_agg(
              snapshot_type,
              jsonb_build_object(
                'status',                  status,
                'last_attempted_at',       last_attempted_at,
                'last_successful_at',      last_successful_at,
                'last_successful_period',  last_successful_period,
                'record_count',            record_count
              )
            )
            FROM retailer_snapshot_health
            WHERE retailer_id = rm.retailer_id
          ), '{}'::jsonb)
          ||
          jsonb_build_object(
            'overview',
            jsonb_build_object(
              'status', CASE WHEN overview_health.last_successful_at IS NULL THEN 'unknown' ELSE 'ok' END,
              'last_successful_at', overview_health.last_successful_at,
              'last_successful_period', overview_health.last_successful_period,
              'record_count', overview_health.record_count
            ),
            'auctions',
            jsonb_build_object(
              'status', CASE WHEN auction_health.last_successful_period IS NULL THEN 'unknown' ELSE 'ok' END,
              'last_successful_at', auction_health.last_successful_at,
              'last_successful_period', auction_health.last_successful_period,
              'record_count', auction_health.record_count
            )
          )
        ) as snapshot_health
      FROM retailers rm
      ${overviewHealthLateral}
      ${auctionHealthLateral}
      WHERE rm.retailer_id = ANY($1)
      ORDER BY rm.retailer_name
    `
    queryParams = [retailerIds]
  }

  const result = await query<RetailerListItem>(queryText, queryParams)
  let rows = result.rows

  if (isStaff) {
    const reportsResult = await query<{ retailer_id: string; last_report_date: Date; report_count: string; pending_count: string }>(`
      SELECT
        retailer_id,
        MAX(created_at) AS last_report_date,
        COUNT(*) AS report_count,
        COUNT(*) FILTER (WHERE status IN ('draft', 'pending_approval') AND NOT is_archived) AS pending_count
      FROM reports
      GROUP BY retailer_id
    `)
    const reportsMap = new Map(reportsResult.rows.map(r => [r.retailer_id, r]))

    rows = rows.map(r => ({
      ...r,
      last_report_date: reportsMap.get(r.retailer_id)?.last_report_date
        ? new Date(reportsMap.get(r.retailer_id)!.last_report_date).toISOString()
        : null,
      report_count: parseInt(reportsMap.get(r.retailer_id)?.report_count ?? '0', 10),
      pending_report_count: parseInt(reportsMap.get(r.retailer_id)?.pending_count ?? '0', 10),
    }))

    rows = rows.map(r => {
      if (r.is_demo !== true) return r
      const demoSnapshotHealth = {
        status: 'ok' as const,
        last_attempted_at: new Date().toISOString(),
        last_successful_at: new Date().toISOString(),
        last_successful_period: '2026-02',
        record_count: 1,
      }
      return {
        ...r,
        snapshot_health: {
          overview: demoSnapshotHealth,
          keywords: demoSnapshotHealth,
          categories: demoSnapshotHealth,
          products: demoSnapshotHealth,
          auctions: demoSnapshotHealth,
        },
      }
    })
  }

  return rows
}

async function getAuctionUploadLatestMonth() {
  const dataResult = await query<{ latest_month: string | null }>(`
    SELECT to_char(MAX(month), 'YYYY-MM') AS latest_month
    FROM auction_insights
  `)

  return dataResult.rows[0]?.latest_month ?? null
}

async function getMarketProfilesCounts() {
  const columnsResult = await query<{ has_columns: boolean }>(`
    SELECT (
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'profile_status'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'profile_domains'
      )
    ) AS has_columns
  `)

  if (columnsResult.rows[0]?.has_columns !== true) {
    const allRetailers = await query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM retailers`)
    return {
      unassigned_count: parseInt(allRetailers.rows[0]?.total ?? '0', 10),
      unconfirmed_count: 0,
    }
  }

  const counts = await query<{ unassigned_count: string; unconfirmed_count: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(profile_status, 'unassigned') = 'unassigned')::text AS unassigned_count,
      COUNT(*) FILTER (WHERE COALESCE(profile_status, 'unassigned') = 'pending_confirmation')::text AS unconfirmed_count
    FROM retailers
  `)

  return {
    unassigned_count: parseInt(counts.rows[0]?.unassigned_count ?? '0', 10),
    unconfirmed_count: parseInt(counts.rows[0]?.unconfirmed_count ?? '0', 10),
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [retailers, auctionLatestMonth, marketProfiles] = await Promise.all([
      getRetailers(session),
      getAuctionUploadLatestMonth(),
      getMarketProfilesCounts(),
    ])

    const payload: DashboardSummaryResponse = {
      retailers,
      header: {
        auction_upload: {
          latest_month: auctionLatestMonth,
        },
        market_profiles: {
          unassigned_count: marketProfiles.unassigned_count,
          unconfirmed_count: marketProfiles.unconfirmed_count,
        },
      },
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Dashboard summary error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard summary', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
