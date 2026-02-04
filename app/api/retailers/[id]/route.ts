// Retailer Details API Route
// GET /api/retailers/[id] - Get single retailer details with permission checks

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
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

    // Query retailer metadata
    const metadataResult = await query(
      `SELECT * FROM retailer_metadata WHERE retailer_id = $1`,
      [retailerId]
    );

    if (metadataResult.rows.length === 0) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 });
    }

    const retailer = metadataResult.rows[0];

    // Query retailer config
    const configResult = await query(
      `SELECT * FROM retailer_config WHERE retailer_id = $1`,
      [retailerId]
    );

    let config: RetailerConfigResponse;
    if (configResult.rows.length > 0) {
      config = configResult.rows[0];
    } else {
      // Return default config if not exists
      config = {
        retailer_id: retailerId,
        visible_tabs: ['overview', 'keywords', 'categories', 'products', 'auctions', 'coverage'],
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
    const metricsResult = await query(
      `SELECT gmv, conversions, validation_rate, impressions, clicks, ctr, cvr, roi
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
    };

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
