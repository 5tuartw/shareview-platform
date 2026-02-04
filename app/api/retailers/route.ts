// Retailers List API Route
// GET /api/retailers - List all accessible retailers with role-based filtering

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { filterRetailersByAccess } from '@/lib/permissions';
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
    let queryParams: any[];

    if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
      // SALES_TEAM and CSS_ADMIN see all retailers with full metrics
      queryText = `
        SELECT 
          rm.retailer_id, 
          rm.retailer_name, 
          rm.category, 
          rm.tier, 
          rm.status, 
          rm.account_manager, 
          rm.high_priority,
          latest.report_month,
          latest.report_date,
          latest.impressions,
          latest.google_clicks,
          latest.network_clicks,
          latest.assists,
          latest.network_conversions_transaction,
          latest.google_conversions_transaction,
          latest.network_conversions_click,
          latest.google_conversions_click,
          latest.no_of_orders,
          latest.gmv,
          latest.commission_unvalidated,
          latest.commission_validated,
          latest.validation_rate,
          latest.css_spend,
          latest.profit,
          latest.ctr,
          latest.cpc,
          latest.conversion_rate,
          latest.epc,
          latest.validated_epc,
          latest.net_epc,
          latest.roi,
          latest.previous_commission_rate,
          latest.current_commission_rate,
          latest.commission_rate_target,
          latest.forecasted_gmv,
          0 as alert_count
        FROM retailer_metadata rm
        LEFT JOIN LATERAL (
          SELECT 
            report_month,
            report_date,
            impressions,
            google_clicks,
            network_clicks,
            assists,
            network_conversions_transaction,
            google_conversions_transaction,
            network_conversions_click,
            google_conversions_click,
            no_of_orders,
            gmv,
            commission_unvalidated,
            commission_validated,
            validation_rate,
            css_spend,
            profit,
            ctr,
            cpc,
            conversion_rate,
            epc,
            validated_epc,
            net_epc,
            roi,
            previous_commission_rate,
            current_commission_rate,
            commission_rate_target,
            forecasted_gmv
          FROM retailer_metrics
          WHERE retailer_id = rm.retailer_id
          ORDER BY fetch_datetime DESC
          LIMIT 1
        ) latest ON true
        ORDER BY rm.retailer_name
      `;
      queryParams = [];
    } else {
      // CLIENT roles see only their accessible retailers
      if (!retailerIds || retailerIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      queryText = `
        SELECT 
          rm.retailer_id, 
          rm.retailer_name, 
          rm.category, 
          rm.tier, 
          rm.status, 
          rm.account_manager, 
          rm.high_priority,
          latest.gmv, 
          latest.conversions, 
          latest.validation_rate,
          0 as alert_count
        FROM retailer_metadata rm
        LEFT JOIN LATERAL (
          SELECT gmv, conversions, validation_rate
          FROM retailer_metrics
          WHERE retailer_id = rm.retailer_id
          ORDER BY fetch_datetime DESC
          LIMIT 1
        ) latest ON true
        WHERE rm.retailer_id = ANY($1)
        ORDER BY rm.retailer_name
      `;
      queryParams = [retailerIds];
    }

    const result = await query<RetailerListItem>(queryText, queryParams);

    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    console.error('Error fetching retailers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retailers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
