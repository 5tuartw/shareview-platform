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
      // has_data = true when at least one domain_metrics row exists (live analytics data)
      queryText = `
        SELECT 
          rm.retailer_id, 
          rm.retailer_name, 
          COALESCE(rm.category, '') as category,
          COALESCE(rm.tier, '') as tier,
          COALESCE(rm.status, 'Active') as status,
          COALESCE(rm.account_manager, '') as account_manager,
          COALESCE(rm.high_priority, false) as high_priority,
          0 as alert_count,
          EXISTS (
            SELECT 1 FROM domain_metrics dm WHERE dm.retailer_id = rm.retailer_id
          ) as has_data
        FROM retailers rm
        ORDER BY has_data DESC, rm.retailer_name
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
          COALESCE(rm.status, 'Active') as status,
          COALESCE(rm.account_manager, '') as account_manager,
          COALESCE(rm.high_priority, false) as high_priority,
          0 as alert_count,
          EXISTS (
            SELECT 1 FROM domain_metrics dm WHERE dm.retailer_id = rm.retailer_id
          ) as has_data
        FROM retailers rm
        WHERE rm.retailer_id = ANY($1)
        ORDER BY has_data DESC, rm.retailer_name
      `;
      queryParams = [retailerIds];
    }

    // Query the Shareview database
    const result = await query<RetailerListItem>(queryText, queryParams);
    let finalRows = result.rows;

    if (isStaff) {
      // Fetch last_report_date from app database for staff
      const reportsQuery = `
        SELECT retailer_id, MAX(created_at) AS last_report_date
        FROM reports
        GROUP BY retailer_id
      `;
      const reportsResult = await query<{ retailer_id: string; last_report_date: Date }>(reportsQuery);
      const reportsMap = new Map(reportsResult.rows.map(r => [r.retailer_id, r.last_report_date]));

      finalRows = finalRows.map(r => ({
        ...r,
        last_report_date: reportsMap.get(r.retailer_id) ? new Date(reportsMap.get(r.retailer_id) as Date).toISOString() : null,
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
