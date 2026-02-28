// Retailer Details API Route
// GET /api/retailers/[id] - Get single retailer details with permission checks

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryAnalytics } from '@/lib/db';
import { canAccessRetailer } from '@/lib/permissions';
import { logActivity } from '@/lib/activity-logger';
import type { RetailerDetails, RetailerConfigResponse } from '@/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: retailerId } = await params;

    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check retailer access
    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      );
    }

    // Query unified retailers table (shareview DB)
    const retailerResult = await query(
      `SELECT * FROM retailers WHERE retailer_id = $1`,
      [retailerId]
    );

    let retailer = retailerResult.rows[0];

    if (!retailer) {
      // Fallback: look up identity from analytics DB retailer_metrics
      const metricsIdentity = await queryAnalytics(
        `SELECT retailer_id, retailer_name
         FROM retailer_metrics
         WHERE retailer_id = $1
         ORDER BY fetch_datetime DESC
         LIMIT 1`,
        [retailerId]
      );

      if (metricsIdentity.rows.length === 0) {
        return NextResponse.json({ error: 'Retailer not found' }, { status: 404 });
      }

      retailer = {
        retailer_id: metricsIdentity.rows[0].retailer_id,
        retailer_name: metricsIdentity.rows[0].retailer_name,
        status: 'Active',
        category: '',
        tier: '',
        account_manager: '',
      };
    }

    // Build config from the unified retailers row (no second query needed)
    let config: RetailerConfigResponse;
    if (retailer) {
      config = {
        retailer_id: retailer.retailer_id as string,
        visible_tabs: (retailer.visible_tabs as string[] | null)?.filter((tab: string) => tab !== 'coverage') ?? ['overview', 'keywords', 'categories', 'products', 'auctions'],
        visible_metrics: (retailer.visible_metrics as string[] | null) ?? ['gmv', 'conversions', 'cvr', 'impressions', 'ctr'],
        keyword_filters: (retailer.keyword_filters as string[] | null) ?? [],
        features_enabled: (retailer.features_enabled as Record<string, boolean> | null) ?? { insights: true, competitor_comparison: true, market_insights: true },
        updated_by: retailer.config_updated_by as number | null,
        updated_at: retailer.updated_at as string,
      };
    } else {
      // Return default config if not exists
      config = {
        retailer_id: retailerId,
        visible_tabs: ['overview', 'keywords', 'categories', 'products', 'auctions'],
        visible_metrics: ['gmv', 'conversions', 'cvr', 'impressions', 'ctr'],
        keyword_filters: [],
        features_enabled: {
          insights: true,
          competitor_comparison: true,
          market_insights: true,
        },
        updated_by: null,
        updated_at: new Date().toISOString(),
      };
    }

    // Query latest metrics
    const metricsResult = await queryAnalytics(
      `SELECT
          gmv,
          (google_conversions_transaction + network_conversions_transaction) AS conversions,
          validation_rate,
          impressions,
          (google_clicks + network_clicks) AS clicks,
          ctr,
          conversion_rate AS cvr,
          roi
       FROM retailer_metrics
       WHERE retailer_id = $1
       ORDER BY fetch_datetime DESC
       LIMIT 1`,
      [retailerId]
    );

    const latestMetrics = metricsResult.rows.length > 0 ? metricsResult.rows[0] : {};

    // Combine data
    const response: RetailerDetails = {
      ...retailer,
      ...latestMetrics,
      config,
    } as RetailerDetails;

    // Log access
    await logActivity({
      userId: parseInt(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { viewed_by: session.user.email },
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching retailer details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retailer details', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
