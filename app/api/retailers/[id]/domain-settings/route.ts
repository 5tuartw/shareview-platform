// Domain Settings API
// GET  /api/retailers/[id]/domain-settings  — read per-retailer domain customisation
// PUT  /api/retailers/[id]/domain-settings  — update (merges into existing JSONB)

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { canAccessRetailer, hasRole } from '@/lib/permissions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: retailerId } = await params;

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await query(
      `SELECT COALESCE(domain_settings, '{}'::jsonb) AS domain_settings FROM retailers WHERE retailer_id = $1`,
      [retailerId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ categories_trimming_enabled: true });
    }

    const raw = result.rows[0].domain_settings ?? {};
    return NextResponse.json({
      categories_trimming_enabled: raw.categories_trimming_enabled ?? true,
      ...raw,
    });
  } catch (error) {
    console.error('Error fetching domain settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domain settings' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: retailerId } = await params;

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SALES_TEAM / CSS_ADMIN can change settings
    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;

    // Merge provided keys into existing domain_settings JSONB
    await query(
      `UPDATE retailers
       SET domain_settings = domain_settings || $2::jsonb,
           updated_at      = NOW()
       WHERE retailer_id = $1`,
      [retailerId, JSON.stringify(body)]
    );

    // Return the updated settings
    const updated = await query(
      `SELECT domain_settings FROM retailers WHERE retailer_id = $1`,
      [retailerId]
    );

    const raw = updated.rows[0]?.domain_settings ?? {};
    return NextResponse.json({
      categories_trimming_enabled: raw.categories_trimming_enabled ?? true,
      ...raw,
    });
  } catch (error) {
    console.error('Error updating domain settings:', error);
    return NextResponse.json(
      { error: 'Failed to update domain settings' },
      { status: 500 }
    );
  }
}
