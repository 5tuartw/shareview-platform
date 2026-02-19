// Retailers Performance API Route
// GET /api/retailers/performance - Fetch retailer performance metrics for current month
// Supports role-based filtering and will support time period parameters in future

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryAnalytics } from '@/lib/db';
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
    let queryParams: Array<string[] | string | number>;

    if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
      // SALES_TEAM and CSS_ADMIN see all retailers with full metrics
      // Query the latest current month data similar to RSA dashboard's monthly-analytics/run endpoint
      queryText = `
        WITH latest_fetch AS (
          SELECT fetch_datetime, report_date
          FROM retailer_metrics
          WHERE EXTRACT(YEAR FROM report_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            AND EXTRACT(MONTH FROM report_date) = EXTRACT(MONTH FROM CURRENT_DATE)
          ORDER BY report_date DESC, fetch_datetime DESC
          LIMIT 1
        )
        SELECT 
          rm.retailer_id, 
          rm.retailer_name, 
          rm.network,
          rm.report_month,
          rm.report_date,
          rm.fetch_datetime,
          rm.impressions,
          rm.google_clicks,
          rm.network_clicks,
          rm.assists,
          rm.network_conversions_transaction,
          rm.google_conversions_transaction,
          rm.network_conversions_click,
          rm.google_conversions_click,
          rm.no_of_orders,
          rm.gmv,
          rm.commission_unvalidated,
          rm.commission_validated,
          rm.validation_rate,
          rm.css_spend,
          rm.profit,
          rm.ctr,
          rm.cpc,
          rm.conversion_rate,
          rm.epc,
          rm.validated_epc,
          rm.net_epc,
          rm.roi,
          rm.previous_commission_rate,
          rm.current_commission_rate,
          COALESCE(meta.category, '') as category,
          COALESCE(meta.tier, '') as tier,
          COALESCE(meta.status, 'Active') as status,
          COALESCE(meta.account_manager, '') as account_manager,
          COALESCE(meta.high_priority, false) as high_priority,
          0 as alert_count
        FROM retailer_metrics rm
        CROSS JOIN latest_fetch lf
        LEFT JOIN retailer_metadata meta ON rm.retailer_id = meta.retailer_id
        WHERE rm.fetch_datetime = lf.fetch_datetime
          AND rm.report_date = lf.report_date
        ORDER BY COALESCE(meta.high_priority, false) DESC, rm.retailer_name
      `;
      queryParams = [];
    } else {
      // CLIENT roles see only their accessible retailers
      if (!retailerIds || retailerIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      // Query latest current month data for client's retailers
      queryText = `
        WITH latest_fetch AS (
          SELECT fetch_datetime, report_date
          FROM retailer_metrics
          WHERE EXTRACT(YEAR FROM report_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            AND EXTRACT(MONTH FROM report_date) = EXTRACT(MONTH FROM CURRENT_DATE)
          ORDER BY report_date DESC, fetch_datetime DESC
          LIMIT 1
        )
        SELECT 
          rm.retailer_id, 
          rm.retailer_name, 
          COALESCE(meta.category, '') as category,
          COALESCE(meta.tier, '') as tier,
          COALESCE(meta.status, 'Active') as status,
          COALESCE(meta.account_manager, '') as account_manager,
          COALESCE(meta.high_priority, false) as high_priority,
          rm.report_date,
          rm.fetch_datetime,
          rm.gmv, 
          rm.google_conversions_transaction as conversions, 
          rm.validation_rate,
          0 as alert_count
        FROM retailer_metrics rm
        CROSS JOIN latest_fetch lf
        LEFT JOIN retailer_metadata meta ON rm.retailer_id = meta.retailer_id
        WHERE rm.fetch_datetime = lf.fetch_datetime
          AND rm.report_date = lf.report_date
          AND rm.retailer_id = ANY($1)
        ORDER BY COALESCE(meta.high_priority, false) DESC, rm.retailer_name
      `;
      queryParams = [retailerIds];
    }

    const result = await queryAnalytics<RetailerListItem>(queryText, queryParams);

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error('Error fetching retailer performance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retailer performance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
