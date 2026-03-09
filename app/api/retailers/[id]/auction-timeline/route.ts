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

  // Fetch all (slug, account_name, customer_id, month, data_source) for this retailer.
  // Grouped to deduplicate across campaigns within a month.
  const result = await query<{
    slug: string;
    account_name: string;
    customer_id: string;
    month: string;
    data_source: string;
    is_preferred: boolean;
  }>(`
    SELECT
      slug,
      account_name,
      customer_id,
      to_char(month, 'YYYY-MM') AS month,
      MAX(data_source)           AS data_source,
      bool_or(preferred_for_display) AS is_preferred
    FROM auction_insights
    WHERE retailer_id = $1
    GROUP BY slug, account_name, customer_id, month
    ORDER BY slug, month, account_name
  `, [retailerId]);

  return NextResponse.json({ rows: result.rows });
}
