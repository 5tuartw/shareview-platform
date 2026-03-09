import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { query } from '@/lib/db';
import { sanitiseMarketProfileDomains, type MarketProfileDomains } from '@/lib/market-profiles';

type Params = {
  retailerId: string;
};

type RequestBody = {
  mode?: 'manual' | 'ai';
  domains?: MarketProfileDomains;
  confirm?: boolean;
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<Params> }
) {
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
      return NextResponse.json(
        { error: 'Market profile columns are missing. Run migration 20260308010000 first.' },
        { status: 409 }
      );
    }

    const { retailerId } = await params;
    const body = (await request.json()) as RequestBody;

    const mode = body.mode === 'ai' ? 'ai' : 'manual';
    const sanitisedDomains = sanitiseMarketProfileDomains(body.domains, mode);

    if (mode === 'manual' && Object.keys(sanitisedDomains).length === 0) {
      return NextResponse.json(
        { error: 'Manual assignment requires at least one profile domain value.' },
        { status: 400 }
      );
    }

    const confirm = body.confirm === true;
    const profileStatus = confirm ? 'confirmed' : 'pending_confirmation';

    const result = await query<{ retailer_id: string }>(
      `
        UPDATE retailers
        SET
          profile_domains = $2::jsonb,
          profile_assignment_mode = $3,
          profile_status = $4,
          profile_updated_at = NOW(),
          profile_confirmed_at = CASE WHEN $5 THEN NOW() ELSE NULL END,
          updated_at = NOW()
        WHERE retailer_id = $1
        RETURNING retailer_id
      `,
      [retailerId, JSON.stringify(sanitisedDomains), mode, profileStatus, confirm]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 });
    }

    return NextResponse.json({
      retailer_id: retailerId,
      profile_status: profileStatus,
      profile_assignment_mode: mode,
      profile_domains: sanitisedDomains,
    });
  } catch (error) {
    console.error('Update market profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
