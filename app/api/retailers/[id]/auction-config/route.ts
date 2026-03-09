import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { query } from '@/lib/db';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: retailerId } = await context.params;

  // Slug assignments for this retailer
  const slugsResult = await query<{
    id: number;
    provider: string;
    slug: string;
    assigned_by: string | null;
    created_at: string;
  }>(`
    SELECT id, provider, slug, assigned_by, created_at
    FROM auction_slug_assignments
    WHERE retailer_id = $1
    ORDER BY provider, slug
  `, [retailerId]);

  // Months with data in auction_insights
  const monthsResult = await query<{
    month: string;
    competitor_count: number;
    has_self_rows: boolean;
    data_source: string | null;
    upload_id: number | null;
  }>(`
    SELECT
      to_char(month, 'YYYY-MM') AS month,
      COUNT(*) FILTER (WHERE NOT is_self)::int AS competitor_count,
      bool_or(is_self) AS has_self_rows,
      MAX(data_source) AS data_source,
      MAX(upload_id) AS upload_id
    FROM auction_insights
    WHERE retailer_id = $1
    GROUP BY month
    ORDER BY month DESC
    LIMIT 24
  `, [retailerId]);

  // Snapshot health for auctions
  const healthResult = await query<{
    status: string;
    last_successful_at: string | null;
    last_successful_period: string | null;
    record_count: number | null;
  }>(`
    SELECT status, last_successful_at, last_successful_period, record_count
    FROM retailer_snapshot_health
    WHERE retailer_id = $1 AND snapshot_type = 'auctions'
  `, [retailerId]);

  // Multi-account months: months where multiple (provider, slug) pairs have data
  const multiAccountResult = await query<{
    month: string;
    provider: string;
    slug: string;
    account_name: string | null;
    is_preferred: boolean;
  }>(`
    SELECT
      to_char(month, 'YYYY-MM') AS month,
      provider,
      slug,
      MAX(account_name) AS account_name,
      bool_or(preferred_for_display) AS is_preferred
    FROM auction_insights
    WHERE retailer_id = $1 AND provider IS NOT NULL AND slug IS NOT NULL
    GROUP BY month, provider, slug
    ORDER BY month DESC, bool_or(preferred_for_display) DESC, provider, slug
  `, [retailerId]);

  // Group by month, only keep months with >1 distinct provider:slug
  const monthAccountMap = new Map<string, typeof multiAccountResult.rows>();
  for (const row of multiAccountResult.rows) {
    const existing = monthAccountMap.get(row.month) ?? [];
    existing.push(row);
    monthAccountMap.set(row.month, existing);
  }
  const multiAccountMonths = Array.from(monthAccountMap.entries())
    .filter(([, accounts]) => accounts.length > 1)
    .map(([month, accounts]) => ({
      month,
      accounts: accounts.map(a => ({
        provider: a.provider,
        slug: a.slug,
        account_name: a.account_name ?? `${a.provider}-${a.slug}`,
        is_preferred: a.is_preferred,
      })),
    }));

  // Unassigned slugs: rows in auction_slug_assignments with no retailer, usable for editing
  const unassignedResult = await query<{ provider: string; slug: string }>(`
    SELECT provider, slug
    FROM auction_slug_assignments
    WHERE retailer_id IS NULL
    ORDER BY provider, slug
  `);

  return NextResponse.json({
    retailer_id: retailerId,
    slug_assignments: slugsResult.rows,
    months: monthsResult.rows,
    snapshot_health: healthResult.rows[0] ?? null,
    multi_account_months: multiAccountMonths,
    unassigned_slugs: unassignedResult.rows,
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: retailerId } = await context.params;
  const body = await req.json().catch(() => null);

  if (!body || body.action !== 'reassign_slug') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { old_id, new_provider, new_slug } = body as {
    old_id: number;
    new_provider: string;
    new_slug: string;
  };

  if (!old_id || !new_provider || !new_slug) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Nullify old assignment
  await query(
    'UPDATE auction_slug_assignments SET retailer_id = NULL WHERE id = $1 AND retailer_id = $2',
    [old_id, retailerId]
  );

  // Assign the selected unassigned slug to this retailer
  await query(
    `UPDATE auction_slug_assignments
     SET retailer_id = $1, assigned_by = $2
     WHERE provider = $3 AND slug = $4 AND retailer_id IS NULL`,
    [retailerId, session?.user?.id ?? null, new_provider, new_slug]
  );

  return NextResponse.json({ ok: true });
}
