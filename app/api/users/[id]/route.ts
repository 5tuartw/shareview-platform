// User Update and Delete API Route
// PUT /api/users/[id] - Update user (SALES_TEAM only)
// DELETE /api/users/[id] - Delete user (SALES_TEAM only)

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { auth } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { hasRole } from '@/lib/permissions';
import { logActivity } from '@/lib/activity-logger';
import type { UpdateUserRequest } from '@/types';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    // Authenticate and authorize
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body: UpdateUserRequest = await request.json();
    const { email, username, password, full_name, role, is_active, retailerIds } = body;

    // Use transaction to update user and access records atomically
    const result = await transaction(async (client) => {
      // Build update query dynamically
      const updates: string[] = [];
      const values: Array<string | number | boolean | null> = [];
      let paramCounter = 1;

      if (email !== undefined) {
        updates.push(`email = $${paramCounter++}`);
        values.push(email);
      }
      if (username !== undefined) {
        updates.push(`username = $${paramCounter++}`);
        values.push(username);
      }
      if (full_name !== undefined) {
        updates.push(`full_name = $${paramCounter++}`);
        values.push(full_name);
      }
      if (role !== undefined) {
        updates.push(`role = $${paramCounter++}`);
        values.push(role);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCounter++}`);
        values.push(is_active);
      }
      if (password !== undefined) {
        const password_hash = await bcrypt.hash(password, 10);
        updates.push(`password_hash = $${paramCounter++}`);
        values.push(password_hash);
      }

      updates.push(`updated_at = NOW()`);

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      // Add user ID to values
      values.push(userId);

      // Update user
      const userResult = await client.query(
        `UPDATE users 
         SET ${updates.join(', ')}
         WHERE id = $${paramCounter}
         RETURNING id, email, username, full_name, role, is_active, created_at, last_login`,
        values
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const updatedUser = userResult.rows[0];

      // Update retailer access if provided
      if (retailerIds !== undefined) {
        // Determine effective role for access level
        let effectiveRole = role;
        if (effectiveRole === undefined) {
          // Fetch existing role if not provided to avoid downgrading CLIENT_ADMIN to VIEWER
          effectiveRole = updatedUser.role;
        }

        // Delete existing access records
        await client.query(
          `DELETE FROM user_retailer_access WHERE user_id = $1`,
          [userId]
        );

        // Insert new access records
        if (retailerIds.length > 0) {
          const accessLevel = effectiveRole === 'CLIENT_ADMIN' ? 'ADMIN' : 'VIEWER';
          for (const retailerId of retailerIds) {
            await client.query(
              `INSERT INTO user_retailer_access (user_id, retailer_id, access_level, granted_by, granted_at)
               VALUES ($1, $2, $3, $4, NOW())`,
              [userId, retailerId, accessLevel, parseInt(session.user.id)]
            );
          }
        }
      }

      return updatedUser;
    });

    // Log activity
    await logActivity({
      userId: parseInt(session.user.id),
      action: 'user_updated',
      entityType: 'user',
      entityId: userId.toString(),
      details: {
        updated_fields: Object.keys(body),
        target_user: result.email,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error updating user:', error);

    if (error instanceof Error && error.message === 'User not found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'Email or username already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update user', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    // Authenticate and authorize
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 }
      );
    }

    // Prevent deletion of own account
    if (parseInt(session.user.id) === userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Use transaction to delete user and log activity
    await transaction(async (client) => {
      // Get user email before deletion
      const userResult = await client.query(
        `SELECT email FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const deletedEmail = userResult.rows[0].email;

      // Delete user (CASCADE will delete user_retailer_access records)
      await client.query(
        `DELETE FROM users WHERE id = $1`,
        [userId]
      );

      // Log activity
      await logActivity({
        userId: parseInt(session.user.id),
        action: 'user_deleted',
        entityType: 'user',
        entityId: userId.toString(),
        details: {
          deleted_user: deletedEmail,
        },
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting user:', error);

    if (error instanceof Error && error.message === 'User not found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to delete user', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
