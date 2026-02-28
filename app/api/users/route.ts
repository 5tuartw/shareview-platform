// Users Management API Route
// GET /api/users - List all users (SALES_TEAM only)
// POST /api/users - Create new user (SALES_TEAM only)

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { auth } from '@/lib/auth';
import { query, transaction } from '@/lib/db';
import { hasRole } from '@/lib/permissions';
import { logActivity } from '@/lib/activity-logger';
import type { CreateUserRequest, UserResponse, RetailerAccess } from '@/types';

export async function GET() {
  try {
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

    // Query all users
    const usersResult = await query(
      `SELECT id, email, username, full_name, role, is_active, created_at, last_login 
       FROM users 
       ORDER BY created_at DESC`
    );

    // For each user, get their retailer access
    const users: UserResponse[] = await Promise.all(
      usersResult.rows.map(async (user) => {
        const accessResult = await query(
          `SELECT ura.retailer_id, ura.access_level, rm.retailer_name
           FROM user_retailer_access ura
           JOIN retailers rm ON ura.retailer_id = rm.retailer_id
           WHERE ura.user_id = $1
           ORDER BY rm.retailer_name`,
          [user.id]
        );

        const retailerAccess: RetailerAccess[] = accessResult.rows.map(row => ({
          retailer_id: row.retailer_id,
          retailer_name: row.retailer_name,
          access_level: row.access_level,
        }));

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active,
          created_at: user.created_at,
          last_login: user.last_login,
          retailerAccess,
        };
      })
    );

    return NextResponse.json(users, { status: 200 });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
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
    const body: CreateUserRequest = await request.json();
    const { email, username, password, full_name, role, retailerIds = [] } = body;

    // Validate required fields
    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, role' },
        { status: 400 }
      );
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Use transaction to create user and access records atomically
    const result = await transaction(async (client) => {
      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (email, username, password_hash, full_name, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW())
         RETURNING id, email, username, full_name, role, is_active, created_at`,
        [email, username, password_hash, full_name, role]
      );

      const newUser = userResult.rows[0];

      // Insert retailer access records
      if (retailerIds.length > 0) {
        const accessLevel = role === 'CLIENT_ADMIN' ? 'ADMIN' : 'VIEWER';
        for (const retailerId of retailerIds) {
          await client.query(
            `INSERT INTO user_retailer_access (user_id, retailer_id, access_level, granted_by, granted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [newUser.id, retailerId, accessLevel, parseInt(session.user.id)]
          );
        }
      }

      return newUser;
    });

    // Log activity
    await logActivity({
      userId: parseInt(session.user.id),
      action: 'user_created',
      entityType: 'user',
      entityId: result.id.toString(),
      details: {
        created_user: email,
        role,
        retailer_count: retailerIds.length,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // Return created user (exclude password_hash)
    return NextResponse.json(
      {
        id: result.id,
        email: result.email,
        username: result.username,
        full_name: result.full_name,
        role: result.role,
        is_active: result.is_active,
        created_at: result.created_at,
        retailerAccess: [],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating user:', error);

    // Handle unique constraint violations
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'User with this email or username already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create user', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
