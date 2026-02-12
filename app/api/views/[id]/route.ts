import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { hasRole } from '@/lib/permissions';

interface DashboardViewPayload {
  name?: string;
  column_order?: string[];
  icon?: string;
  is_default?: boolean;
  visible_tags?: string[] | null;
}

// GET /api/views/[id] - Get specific view by id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const result = await query(
      `SELECT id, name, icon, is_default, column_order, visible_tags, created_at, updated_at
       FROM dashboard_views
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching view:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/views/[id] - Update view
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json()) as DashboardViewPayload;
    const { name, icon, column_order, visible_tags, is_default } = body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: Array<string | number | boolean | null> = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(icon);
    }
    if (column_order !== undefined) {
      if (!Array.isArray(column_order) || column_order.length === 0) {
        return NextResponse.json({ error: 'column_order must be a non-empty array' }, { status: 400 });
      }
      updates.push(`column_order = $${paramIndex++}`);
      values.push(JSON.stringify(column_order));
    }
    if (visible_tags !== undefined) {
      updates.push(`visible_tags = $${paramIndex++}`);
      values.push(visible_tags ? JSON.stringify(visible_tags) : null);
    }
    if (is_default !== undefined) {
      // If setting as default, unset other defaults first
      if (is_default) {
        await query('UPDATE dashboard_views SET is_default = false WHERE is_default = true AND id != $1', [id]);
      }
      updates.push(`is_default = $${paramIndex++}`);
      values.push(is_default);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query(
      `UPDATE dashboard_views
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, icon, is_default, column_order, visible_tags, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Error updating view:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'View name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/views/[id] - Delete view
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if view is default
    const checkResult = await query(
      'SELECT is_default FROM dashboard_views WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    if (checkResult.rows[0].is_default) {
      return NextResponse.json({ error: 'Cannot delete default view' }, { status: 400 });
    }

    await query('DELETE FROM dashboard_views WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting view:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
