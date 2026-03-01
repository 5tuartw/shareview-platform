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
          COALESCE(rm.account_manager, '') as account_manager,
          COALESCE(rm.high_priority, false) as high_priority,
          0 as alert_count,
          GREATEST(
            (SELECT MAX(last_updated) FROM keywords_snapshots             WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM category_performance_snapshots WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM product_performance_snapshots  WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM auction_insights_snapshots     WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM product_coverage_snapshots     WHERE retailer_id = rm.retailer_id)
          ) as latest_data_at,
          (
            SELECT json_object_agg(
              snapshot_type,
              json_build_object(
                'status',                  status,
                'last_attempted_at',       last_attempted_at,
                'last_successful_at',      last_successful_at,
                'last_successful_period',  last_successful_period,
                'record_count',            record_count
              )
            )
            FROM retailer_snapshot_health
            WHERE retailer_id = rm.retailer_id
          ) as snapshot_health
        FROM retailers rm
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
          COALESCE(rm.account_manager, '') as account_manager,
          COALESCE(rm.high_priority, false) as high_priority,
          0 as alert_count,
          GREATEST(
            (SELECT MAX(last_updated) FROM keywords_snapshots             WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM category_performance_snapshots WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM product_performance_snapshots  WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM auction_insights_snapshots     WHERE retailer_id = rm.retailer_id),
            (SELECT MAX(last_updated) FROM product_coverage_snapshots     WHERE retailer_id = rm.retailer_id)
          ) as latest_data_at,
          (
            SELECT json_object_agg(
              snapshot_type,
              json_build_object(
                'status',                  status,
                'last_attempted_at',       last_attempted_at,
                'last_successful_at',      last_successful_at,
                'last_successful_period',  last_successful_period,
                'record_count',            record_count
              )
            )
            FROM retailer_snapshot_health
            WHERE retailer_id = rm.retailer_id
          ) as snapshot_health
        FROM retailers rm
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
