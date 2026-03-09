/**
 * GET /api/admin/auction-upload/history
 *
 * Returns a list of all auction upload records, newest first.
 * Used by the admin upload page to show upload history.
 *
 * Response: Array<{
 *   id: number,
 *   filename: string,
 *   row_count: number,
 *   months_imported: string[],
 *   uploaded_at: string,
 *   uploaded_by: string,
 *   notes: string | null,
 * }>
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 },
      );
    }

    const result = await query<{
      id: number;
      filename: string;
      row_count: number;
      months_imported: string[];
      uploaded_at: string;
      uploaded_by: string;
      notes: string | null;
    }>(
      `SELECT
         u.id,
         u.filename,
         u.row_count,
         u.months_imported,
         u.uploaded_at,
         COALESCE(usr.name, usr.email, u.uploaded_by::text) AS uploaded_by,
         u.notes
       FROM auction_uploads u
       LEFT JOIN users usr ON usr.id::text = u.uploaded_by::text
       ORDER BY u.uploaded_at DESC
       LIMIT 100`,
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Auction upload history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
