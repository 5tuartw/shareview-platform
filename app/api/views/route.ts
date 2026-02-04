import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { hasRole } from '@/lib/permissions';

// GET /api/views - List all views ordered by is_default DESC, name ASC
export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Role-based access: SALES_TEAM, CSS_ADMIN only
    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' }, { status: 403 });
    }

    const result = await query(
      `SELECT id, name, icon, is_default, column_order, visible_tags, created_at, updated_at
       FROM dashboard_views
       ORDER BY is_default DESC, name ASC`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching views:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/views - Create new view
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, column_order, icon = '📊', is_default = false, visible_tags = null } = body;

    // Validation
    if (!name || !column_order || !Array.isArray(column_order) || column_order.length === 0) {
      return NextResponse.json(
        { error: 'Name and column_order (non-empty array) are required' },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults first
    if (is_default) {
      await query('UPDATE dashboard_views SET is_default = false WHERE is_default = true');
    }

    const result = await query(
      `INSERT INTO dashboard_views (name, icon, is_default, column_order, visible_tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, icon, is_default, column_order, visible_tags, created_at, updated_at`,
      [name, icon, is_default, JSON.stringify(column_order), visible_tags ? JSON.stringify(visible_tags) : null]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: any) {
    console.error('Error creating view:', error);
    if (error.code === '23505') { // Unique violation
      return NextResponse.json({ error: 'View name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
