/**
 * POST /api/admin/auction-upload/preview
 *
 * Accepts multipart/form-data with a `file` field (CSV buffer).
 * Parses the CSV, resolves slug→retailer mappings, and returns a preview
 * showing what will be imported along with any unresolved slugs or data conflicts.
 *
 * Response shape:
 * {
 *   parsed_months: string[],                  // e.g. ["2026-01"]
 *   slugs: Array<{
 *     provider: string,
 *     slug: string,
 *     row_count: number,
 *     months: string[],
 *     inferred_retailer_id: string | null,     // from DB assignment or alias map
 *     db_assignment: string | null,            // from auction_slug_assignments table
 *     has_self_rows: boolean,
 *   }>,
 *   existing_conflicts: Array<{retailer_id: string, month: string}>,
 *   parse_errors: number,
 *   summary: {
 *     total_rows: number,
 *     unique_slugs: number,
 *     resolved_slugs: number,
 *     unresolved_slugs: number,
 *   },
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { query } from '@/lib/db';
import { parseAuctionCSV } from '@/lib/auction-csv-parser';
import { SHARED_ACCOUNT_NAMES, resolveRetailerId, buildDehyphenatedMap } from '@/lib/auction-slug-map';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: Staff or Super Admin role required' },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, slugSummary, months, parseErrors } = parseAuctionCSV(buffer);

    // Load existing slug assignments from DB
    const dbAssignmentsResult = await query<{
      provider: string;
      slug: string;
      retailer_id: string | null;
    }>(
      'SELECT provider, slug, retailer_id FROM auction_slug_assignments',
    );
    const dbAssignmentMap = new Map<string, string | null>();
    for (const row of dbAssignmentsResult.rows) {
      dbAssignmentMap.set(`${row.provider}:${row.slug}`, row.retailer_id);
    }

    // Load all known retailer IDs
    const retailersResult = await query<{ retailer_id: string }>(
      'SELECT retailer_id FROM retailers ORDER BY retailer_id',
    );
    const knownRetailerIds = new Set(retailersResult.rows.map(r => r.retailer_id));
    const dehyphenatedMap = buildDehyphenatedMap(knownRetailerIds);

    // Build slug resolution results
    const slugs = slugSummary.map(({ provider, slug, rowCount, months: slugMonths }) => {
      const key = `${provider}:${slug}`;
      const db_assignment = dbAssignmentMap.has(key) ? (dbAssignmentMap.get(key) ?? null) : undefined;

      // Resolve: DB assignment takes precedence, then alias map, then direct match
      let inferred_retailer_id: string | null = null;
      if (db_assignment !== undefined) {
        inferred_retailer_id = db_assignment;
      } else {
        inferred_retailer_id = resolveRetailerId(provider, slug, knownRetailerIds, dehyphenatedMap);
      }

      const has_self_rows = rows.some(r => r.provider === provider && r.slug === slug && r.is_self);

      return {
        provider,
        slug,
        row_count: rowCount,
        months: slugMonths,
        inferred_retailer_id,
        db_assignment: db_assignment !== undefined ? db_assignment : null,
        has_self_rows,
      };
    });

    // Check for existing data conflicts
    // Gather (retailer_id, month) pairs we'd be importing
    const resolvedPairs = slugs
      .filter(s => s.inferred_retailer_id)
      .flatMap(s =>
        s.months.map(m => ({ retailer_id: s.inferred_retailer_id as string, month: `${m}-01` })),
      );

    let existing_conflicts: Array<{ retailer_id: string; month: string }> = [];
    if (resolvedPairs.length > 0) {
      // Build parameterised check
      const placeholders = resolvedPairs
        .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::date)`)
        .join(', ');
      const params = resolvedPairs.flatMap(p => [p.retailer_id, p.month]);

      const conflictsResult = await query<{ retailer_id: string; month: string }>(
        `SELECT DISTINCT retailer_id, to_char(month, 'YYYY-MM') as month
         FROM auction_insights
         WHERE (retailer_id, month) IN (${placeholders})`,
        params,
      );
      existing_conflicts = conflictsResult.rows;
    }

    // ── Account conflict detection ─────────────────────────────────────────────
    // Find cases where the same retailer has data from multiple CSS platform
    // accounts (different customer_ids via different provider:slug pairs) in the
    // same month.  We group by (retailer_id, month_str) across all rows, then
    // surface any group that has more than one distinct customer_id as a conflict
    // requiring the admin to choose a preferred account.

    // Build slug→retailer_id lookup from resolved slugs
    const slugRetailerMap = new Map<string, string | null>();
    for (const s of slugs) {
      slugRetailerMap.set(`${s.provider}:${s.slug}`, s.inferred_retailer_id);
    }

    // Accumulate account info per (retailer_id, month_str, provider, slug)
    type AccountEntry = {
      customer_id: string;
      account_name: string;
      row_count: number;
      is_shared: boolean;
    };
    // key: "retailer_id:month_str:provider:slug" → AccountEntry (one per customer_id per ps-pair)
    const psEntries = new Map<string, AccountEntry>();
    for (const row of rows) {
      if (!row.provider || !row.slug) continue;
      const retailer_id = slugRetailerMap.get(`${row.provider}:${row.slug}`);
      if (!retailer_id) continue;
      const entryKey = `${retailer_id}:${row.month_str}:${row.provider}:${row.slug}:${row.customer_id}`;
      const existing = psEntries.get(entryKey);
      if (existing) {
        existing.row_count++;
      } else {
        psEntries.set(entryKey, {
          customer_id: row.customer_id,
          account_name: row.account_name,
          row_count: 1,
          is_shared: SHARED_ACCOUNT_NAMES.has(row.account_name.toLowerCase()),
        });
      }
    }

    // Group by (retailer_id, month_str) and collect distinct (provider:slug) entries
    type PsGroup = {
      provider: string;
      slug: string;
      customer_id: string;
      account_name: string;
      row_count: number;
      is_shared: boolean;
      recommended: boolean;
    };
    const retailerMonthGroups = new Map<string, Map<string, PsGroup>>();
    // key1: "retailer_id:month_str", key2: "provider:slug" → PsGroup
    for (const [key, entry] of psEntries.entries()) {
      const [retailer_id, month_str, provider, slug] = key.split(':');
      const rmKey = `${retailer_id}:${month_str}`;
      const psKey = `${provider}:${slug}`;
      let group = retailerMonthGroups.get(rmKey);
      if (!group) { group = new Map(); retailerMonthGroups.set(rmKey, group); }
      const existing = group.get(psKey);
      if (!existing) {
        group.set(psKey, { provider, slug, ...entry, recommended: false });
      } else {
        existing.row_count += entry.row_count;
      }
    }

    // Build account_conflicts: only where multiple (provider:slug) pairs exist
    const account_conflicts: Array<{
      retailer_id: string;
      month: string;
      accounts: PsGroup[];
    }> = [];
    for (const [rmKey, group] of retailerMonthGroups.entries()) {
      if (group.size <= 1) continue; // No conflict
      const [retailer_id, month_str] = rmKey.split(':');
      const accounts = Array.from(group.values());
      // Determine recommended: dedicated > shared, then lex on provider:slug
      accounts.sort((a, b) => {
        const scoreA = a.is_shared ? 1 : 0;
        const scoreB = b.is_shared ? 1 : 0;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return `${a.provider}:${a.slug}`.localeCompare(`${b.provider}:${b.slug}`);
      });
      accounts[0].recommended = true;
      account_conflicts.push({ retailer_id, month: month_str, accounts });
    }

    const resolved = slugs.filter(s => s.inferred_retailer_id !== null).length;
    const unresolved = slugs.filter(s => s.inferred_retailer_id === null).length;

    return NextResponse.json({
      parsed_months: months,
      slugs,
      existing_conflicts,
      account_conflicts,
      parse_errors: parseErrors,
      summary: {
        total_rows: rows.length,
        unique_slugs: slugs.length,
        resolved_slugs: resolved,
        unresolved_slugs: unresolved,
      },
    });
  } catch (error) {
    console.error('Auction upload preview error:', error);
    if (error instanceof Error && error.message.includes('header row')) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
