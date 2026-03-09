import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import {
  assignMarketProfilesWithAi,
  hasMarketProfileColumns,
} from '@/lib/market-profile-ai-assignment';

type RequestBody = {
  retailer_ids?: string[];
};

export async function POST(request: Request) {
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

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const retailerIds = Array.isArray(body.retailer_ids)
      ? body.retailer_ids.filter((retailerId): retailerId is string => typeof retailerId === 'string' && retailerId.trim().length > 0)
      : [];

    if (retailerIds.length === 0) {
      return NextResponse.json({ error: 'retailer_ids is required' }, { status: 400 });
    }

    const summary = await assignMarketProfilesWithAi(retailerIds);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Assign AI market profiles error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.toLowerCase().includes('api key')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
