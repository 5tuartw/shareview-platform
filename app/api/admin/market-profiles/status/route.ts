import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { query } from '@/lib/db';

type StatusCounts = {
  unassigned_count: string;
  unconfirmed_count: string;
};

async function hasMarketProfileColumns(): Promise<boolean> {
  const result = await query<{ has_columns: boolean }>(`
    SELECT (
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'profile_status'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'profile_domains'
      )
    ) AS has_columns
  `);

  return result.rows[0]?.has_columns === true;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: Staff or Super Admin role required' },
        { status: 403 }
      );
    }

    const migrationReady = await hasMarketProfileColumns();

    if (!migrationReady) {
      const allRetailers = await query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM retailers`);
      return NextResponse.json({
        migration_ready: false,
        unassigned_count: parseInt(allRetailers.rows[0]?.total ?? '0', 10),
        unconfirmed_count: 0,
      });
    }

    const counts = await query<StatusCounts>(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(profile_status, 'unassigned') = 'unassigned')::text AS unassigned_count,
        COUNT(*) FILTER (WHERE COALESCE(profile_status, 'unassigned') = 'pending_confirmation')::text AS unconfirmed_count
      FROM retailers
    `);

    return NextResponse.json({
      migration_ready: true,
      unassigned_count: parseInt(counts.rows[0]?.unassigned_count ?? '0', 10),
      unconfirmed_count: parseInt(counts.rows[0]?.unconfirmed_count ?? '0', 10),
    });
  } catch (error) {
    console.error('Market profile status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
