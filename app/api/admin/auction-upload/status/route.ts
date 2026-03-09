/**
 * GET /api/admin/auction-upload/status
 *
 * Returns current data availability status for the auction pipeline:
 *   - latest_month:  most recent month present in auction_insights (YYYY-MM or null)
 *   - oldest_month:  oldest month present
 *   - month_count:   number of distinct months in the table
 *   - total_rows:    total rows in auction_insights
 *   - last_uploaded: ISO timestamp of most recent upload, or null
 *   - retailers_with_data: count of distinct retailer_ids with data
 *
 * Used by DashboardHeader badge and admin upload page.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 },
      );
    }

    const [dataResult, uploadsResult] = await Promise.all([
      query<{
        latest_month: string | null;
        oldest_month: string | null;
        month_count: string;
        total_rows: string;
        retailers_with_data: string;
      }>(
        `SELECT
           to_char(MAX(month), 'YYYY-MM')    AS latest_month,
           to_char(MIN(month), 'YYYY-MM')    AS oldest_month,
           COUNT(DISTINCT month)::text        AS month_count,
           COUNT(*)::text                     AS total_rows,
           COUNT(DISTINCT retailer_id)::text  AS retailers_with_data
         FROM auction_insights`,
      ),
      query<{ created_at: string }>(
        `SELECT created_at FROM auction_uploads ORDER BY created_at DESC LIMIT 1`,
      ),
    ]);

    const data = dataResult.rows[0];
    const lastUpload = uploadsResult.rows[0] ?? null;

    return NextResponse.json({
      latest_month: data.latest_month,
      oldest_month: data.oldest_month,
      month_count: parseInt(data.month_count, 10),
      total_rows: parseInt(data.total_rows, 10),
      retailers_with_data: parseInt(data.retailers_with_data, 10),
      last_uploaded: lastUpload?.created_at ?? null,
    });
  } catch (error) {
    console.error('Auction upload status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
