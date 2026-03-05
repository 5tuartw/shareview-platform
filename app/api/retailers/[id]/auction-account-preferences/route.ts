/**
 * PATCH /api/retailers/[id]/auction-account-preferences
 *
 * Updates which (provider, slug) account is marked preferred_for_display for a retailer's
 * auction data. The caller specifies the target account and the scope of the change.
 *
 * Body:
 *   month       — YYYY-MM string, the reference month (always updated)
 *   provider    — the CSS provider to set as preferred
 *   slug        — the slug to set as preferred
 *   apply_scope — 'from_month' (this month and all newer) | 'all' (every uploaded month)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasRole } from '@/lib/permissions';
import { query } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: retailerId } = await context.params;

  let body: { month?: string; provider?: string; slug?: string; apply_scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { month, provider, slug, apply_scope } = body;
  if (!month || !provider || !slug || !apply_scope) {
    return NextResponse.json({ error: 'month, provider, slug, apply_scope are required' }, { status: 400 });
  }
  if (!['from_month', 'all'].includes(apply_scope)) {
    return NextResponse.json({ error: 'apply_scope must be "from_month" or "all"' }, { status: 400 });
  }

  const monthDate = `${month}-01`;

  // Determine which months to update based on scope
  let monthFilter: string;
  let monthParams: (string | string[])[];
  if (apply_scope === 'all') {
    monthFilter = 'retailer_id = $1';
    monthParams = [retailerId];
  } else {
    // from_month: this month and all newer (not older history)
    monthFilter = 'retailer_id = $1 AND month >= $2::date';
    monthParams = [retailerId, monthDate];
  }

  // Set preferred_for_display = false for all NON-matching (provider, slug) rows in scope,
  // then set preferred_for_display = true for the chosen (provider, slug) rows in scope.
  // Two UPDATE statements wrapped in a transaction-like approach using WITH.
  await query(
    `UPDATE auction_insights
     SET preferred_for_display = (provider = $2 AND slug = $3)
     WHERE ${monthFilter}
       AND provider IS NOT NULL
       AND slug IS NOT NULL`,
    apply_scope === 'all'
      ? [retailerId, provider, slug]
      : [retailerId, provider, slug, monthDate],
  );

  // Count rows updated for feedback
  const countResult = await query<{ updated: string }>(
    `SELECT COUNT(*)::text AS updated
     FROM auction_insights
     WHERE ${monthFilter}
       AND provider = $2 AND slug = $3 AND preferred_for_display = true`,
    apply_scope === 'all'
      ? [retailerId, provider, slug]
      : [retailerId, provider, slug, monthDate],
  );

  return NextResponse.json({
    ok: true,
    rows_updated: parseInt(countResult.rows[0]?.updated ?? '0', 10),
    provider,
    slug,
    apply_scope,
  });
}
