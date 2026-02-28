// Retailer Configuration API Route
// GET /api/config/[retailerId] - Get retailer configuration
// PUT /api/config/[retailerId] - Update retailer configuration (SALES_TEAM only)

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { canAccessRetailer, hasRole } from '@/lib/permissions';
import { logActivity } from '@/lib/activity-logger';
import type { RetailerConfigRequest, RetailerConfigResponse } from '@/types';

const VALID_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions'];
const VALID_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ retailerId: string }> }
) {
  try {
    const { retailerId } = await params;

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

    // Query retailer config
    const result = await query(
      `SELECT * FROM retailers WHERE retailer_id = $1`,
      [retailerId]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const config: RetailerConfigResponse = {
        retailer_id: row.retailer_id as string,
        visible_tabs: (row.visible_tabs as string[]).filter((tab: string) => tab !== 'coverage'),
        visible_metrics: row.visible_metrics as string[],
        keyword_filters: row.keyword_filters as string[],
        features_enabled: row.features_enabled as Record<string, boolean>,
        updated_by: row.config_updated_by as number | null,
        updated_at: row.updated_at as string,
      };
      return NextResponse.json(config, { status: 200 });
    } else {
      // Return default config if not exists
      const defaultConfig: RetailerConfigResponse = {
        retailer_id: retailerId,
        visible_tabs: VALID_TABS,
        visible_metrics: VALID_METRICS,
        keyword_filters: [],
        features_enabled: {
          insights: true,
          competitor_comparison: true,
          market_insights: true,
          allow_report_request: false,
          allow_report_generate: false,
          show_ai_disclaimer: false,
          show_reports_tab: false,
        },
        updated_by: null,
        updated_at: new Date().toISOString(),
      };
      return NextResponse.json(defaultConfig, { status: 200 });
    }
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configuration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ retailerId: string }> }
) {
  try {
    const { retailerId } = await params;

    // Authenticate and authorize
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SALES_TEAM can update config
    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: Only SALES_TEAM can update configuration' },
        { status: 403 }
      );
    }

    // Parse request body
    const body: RetailerConfigRequest = await request.json();
    const { visible_tabs, visible_metrics, keyword_filters, features_enabled } = body;

    // Validate visible_tabs
    if (visible_tabs && !Array.isArray(visible_tabs)) {
      return NextResponse.json(
        { error: 'visible_tabs must be an array' },
        { status: 400 }
      );
    }

    if (visible_tabs) {
      const invalidTabs = visible_tabs.filter(tab => !VALID_TABS.includes(tab));
      if (invalidTabs.length > 0) {
        return NextResponse.json(
          { error: `Invalid tabs: ${invalidTabs.join(', ')}. Valid tabs: ${VALID_TABS.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Validate visible_metrics
    if (visible_metrics && !Array.isArray(visible_metrics)) {
      return NextResponse.json(
        { error: 'visible_metrics must be an array' },
        { status: 400 }
      );
    }

    if (visible_metrics) {
      const invalidMetrics = visible_metrics.filter(metric => !VALID_METRICS.includes(metric));
      if (invalidMetrics.length > 0) {
        return NextResponse.json(
          { error: `Invalid metrics: ${invalidMetrics.join(', ')}. Valid metrics: ${VALID_METRICS.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Validate keyword_filters
    if (keyword_filters && !Array.isArray(keyword_filters)) {
      return NextResponse.json(
        { error: 'keyword_filters must be an array' },
        { status: 400 }
      );
    }

    // UPDATE config in unified retailers table
    const result = await query(
      `UPDATE retailers SET
         visible_tabs     = $2,
         visible_metrics  = $3,
         keyword_filters  = $4,
         features_enabled = $5,
         config_updated_by = $6,
         updated_at       = NOW()
       WHERE retailer_id = $1
       RETURNING *`,
      [
        retailerId,
        visible_tabs || VALID_TABS,
        visible_metrics || VALID_METRICS,
        keyword_filters || [],
        JSON.stringify(features_enabled || { insights: true, competitor_comparison: true, market_insights: true, allow_report_request: false, allow_report_generate: false, show_ai_disclaimer: false, show_reports_tab: false }),
        parseInt(session.user.id),
      ]
    );

    const row = result.rows[0];
    const updatedConfig: RetailerConfigResponse = {
      retailer_id: row.retailer_id as string,
      visible_tabs: row.visible_tabs as string[],
      visible_metrics: row.visible_metrics as string[],
      keyword_filters: row.keyword_filters as string[],
      features_enabled: row.features_enabled as Record<string, boolean>,
      updated_by: row.config_updated_by as number | null,
      updated_at: row.updated_at as string,
    };

    // Log activity
    await logActivity({
      userId: parseInt(session.user.id),
      action: 'config_updated',
      retailerId,
      entityType: 'config',
      entityId: retailerId,
      details: {
        changed_fields: Object.keys(body),
        retailer_id: retailerId,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json(updatedConfig, { status: 200 });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
