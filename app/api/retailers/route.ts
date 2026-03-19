// Retailers List API Route
// GET /api/retailers - List all accessible retailers with role-based filtering

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import type { RetailerListItem } from '@/types';

export async function GET() {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role, retailerIds } = session.user;

    const tableCheckResult = await query<{
      has_monthly_archive: boolean;
      has_retailer_data_availability: boolean;
      has_domain_metrics: boolean;
      has_auction_insights: boolean;
    }>(`
      SELECT
        to_regclass('public.monthly_archive') IS NOT NULL AS has_monthly_archive,
        to_regclass('public.retailer_data_availability') IS NOT NULL AS has_retailer_data_availability,
        to_regclass('public.domain_metrics') IS NOT NULL AS has_domain_metrics,
        to_regclass('public.auction_insights') IS NOT NULL AS has_auction_insights
    `);

    const tableAvailability = tableCheckResult.rows[0] ?? {
      has_monthly_archive: false,
      has_retailer_data_availability: false,
      has_domain_metrics: false,
      has_auction_insights: false,
    };

    const overviewAvailabilitySubquery = tableAvailability.has_retailer_data_availability
      ? `
        SELECT
          MAX(updated_at) AS last_successful_at,
          MAX(period) FILTER (WHERE granularity = 'month') AS last_successful_period,
          COUNT(*)::int AS record_count
        FROM retailer_data_availability
        WHERE retailer_id = rm.retailer_id
          AND domain = 'overview'
      `
      : `
        SELECT
          NULL::timestamptz AS last_successful_at,
          NULL::text AS last_successful_period,
          0::int AS record_count
      `;

    const overviewDomainMetricsSubquery = tableAvailability.has_domain_metrics
      ? `
        SELECT
          MAX(calculated_at) AS last_successful_at,
          TO_CHAR(MAX(period_start), 'YYYY-MM') AS last_successful_period,
          COUNT(*)::int AS record_count
        FROM domain_metrics
        WHERE retailer_id = rm.retailer_id
          AND is_active = true
          AND page_type = 'overview'
          AND tab_name = 'overview'
      `
      : `
        SELECT
          NULL::timestamptz AS last_successful_at,
          NULL::text AS last_successful_period,
          0::int AS record_count
      `;

    const overviewHealthLateral = `
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(overview_avail.last_successful_at, overview_dm.last_successful_at) AS last_successful_at,
          COALESCE(overview_avail.last_successful_period, overview_dm.last_successful_period) AS last_successful_period,
          CASE
            WHEN COALESCE(overview_avail.record_count, 0) > 0 THEN overview_avail.record_count
            ELSE COALESCE(overview_dm.record_count, 0)
          END AS record_count
        FROM (${overviewAvailabilitySubquery}) overview_avail
        CROSS JOIN (${overviewDomainMetricsSubquery}) overview_dm
      ) overview_health ON TRUE
    `;

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
      `;

    // Build query based on role
    let queryText: string;
    let queryParams: Array<string[] | string | number> = [];
    let isStaff = false;

    if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
      isStaff = true;
      // SALES_TEAM and CSS_ADMIN see all configured retailers
      // latest_data_at = most recent last_updated across all snapshot tables (set by snapshots:generate)
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
      `;
    } else {
      // CLIENT roles see only their accessible retailers
      if (!retailerIds || retailerIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

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
      `;
      queryParams = [retailerIds];
    }

    // Query the Shareview database
    const result = await query<RetailerListItem>(queryText, queryParams);
    let finalRows = result.rows;

    if (isStaff) {
      // Fetch last_report_date from app database for staff
      const reportsQuery = `
        SELECT
          retailer_id,
          MAX(created_at) AS last_report_date,
          COUNT(*) AS report_count,
          COUNT(*) FILTER (WHERE status IN ('draft', 'pending_approval') AND NOT is_archived) AS pending_count
        FROM reports
        GROUP BY retailer_id
      `;
      const reportsResult = await query<{ retailer_id: string; last_report_date: Date; report_count: string; pending_count: string }>(reportsQuery);
      const reportsMap = new Map(reportsResult.rows.map(r => [r.retailer_id, r]));

      finalRows = finalRows.map(r => ({
        ...r,
        last_report_date: reportsMap.get(r.retailer_id)?.last_report_date
          ? new Date(reportsMap.get(r.retailer_id)!.last_report_date).toISOString()
          : null,
        report_count: parseInt(reportsMap.get(r.retailer_id)?.report_count ?? '0', 10),
        pending_report_count: parseInt(reportsMap.get(r.retailer_id)?.pending_count ?? '0', 10),
      }));

      finalRows = finalRows.map(r => {
        if (r.is_demo === true) {
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
          };
        }

        return r;
      });
    }

    return NextResponse.json(finalRows, { status: 200 });
  } catch (error) {
    console.error('Error fetching retailers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retailers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
