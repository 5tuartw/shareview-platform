/**
 * POST /api/admin/auction-upload/import
 *
 * Accepts multipart/form-data:
 *   file                  — the CSV Buffer (resent from client)
 *   confirmed_assignments — JSON string: Array<{provider, slug, retailer_id: string|null}>
 *   overwrite             — "true" if user has confirmed overwriting existing data
 *   notes                 — optional string logged against the upload record
 *
 * Behaviour:
 *   1. Parse CSV
 *   2. Merge confirmed_assignments with DB assignments and alias-map fallbacks
 *   3. Upsert changed/new slug assignments into auction_slug_assignments
 *   4. If overwrite=true: delete existing auction_insights rows for (retailer_id, month) pairs
 *   5. Detect transition months (same slug in multiple customer_ids in same month)
 *   6. Determine data_source per row: 'dedicated' | 'shared_account' | 'transition'
 *   7. Set preferred_for_display: dedicated rows favoured in transition months
 *   8. Bulk INSERT into auction_insights
 *   9. Insert audit row into auction_uploads
 *
 * Response: { upload_id, rows_inserted, months_imported, retailers_affected }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { transaction } from '@/lib/db';
import { parseAuctionCSV, determineDatasource } from '@/lib/auction-csv-parser';
import { SLUG_TO_RETAILER_ID } from '@/lib/auction-slug-map';
import { SHARED_ACCOUNT_NAMES } from '@/lib/auction-slug-map';

interface ConfirmedAssignment {
  provider: string;
  slug: string;
  retailer_id: string | null;
}

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
    const assignmentsJson = formData.get('confirmed_assignments') as string | null;
    const overwriteFlag = formData.get('overwrite') === 'true';
    const notes = (formData.get('notes') as string | null) ?? null;
    const preferredOverridesJson = formData.get('preferred_overrides') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!assignmentsJson) {
      return NextResponse.json({ error: 'confirmed_assignments is required' }, { status: 400 });
    }

    let confirmedAssignments: ConfirmedAssignment[];
    try {
      confirmedAssignments = JSON.parse(assignmentsJson);
    } catch {
      return NextResponse.json({ error: 'Invalid confirmed_assignments JSON' }, { status: 400 });
    }

    // Optional: user-chosen preferred (provider, slug) per retailer+month, overrides the
    // algorithm used in the post-processing step.
    interface PreferredOverride { retailer_id: string; month: string; provider: string; slug: string; }
    let preferredOverrides: PreferredOverride[] = [];
    if (preferredOverridesJson) {
      try { preferredOverrides = JSON.parse(preferredOverridesJson); } catch { /* ignore */ }
    }
    // Build explicit override map: "retailer_id::month_str" → "provider:slug"
    const explicitWinnerMap = new Map<string, string>();
    for (const o of preferredOverrides) {
      explicitWinnerMap.set(`${o.retailer_id}::${o.month}`, `${o.provider}:${o.slug}`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows } = parseAuctionCSV(buffer);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 422 });
    }

    // Build slug→retailer_id resolution map
    // Priority: confirmed_assignments > DB (fetched in transaction) > alias map > direct
    const confirmedMap = new Map<string, string | null>();
    for (const a of confirmedAssignments) {
      confirmedMap.set(`${a.provider}:${a.slug}`, a.retailer_id);
    }

    // Transition detection: (provider, slug, month) → Set<customer_id>
    const slugMonthAccounts = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.provider || !row.slug) continue;
      const key = `${row.provider}:${row.slug}:${row.month_str}`;
      let s = slugMonthAccounts.get(key);
      if (!s) { s = new Set(); slugMonthAccounts.set(key, s); }
      s.add(row.customer_id);
    }

    const result = await transaction(async (client) => {
      // Load existing DB assignments
      const dbResult = await client.query<{ provider: string; slug: string; retailer_id: string | null }>(
        'SELECT provider, slug, retailer_id FROM auction_slug_assignments',
      );
      const dbMap = new Map<string, string | null>();
      for (const r of dbResult.rows) {
        dbMap.set(`${r.provider}:${r.slug}`, r.retailer_id);
      }

      // Resolve retailer_id for each slug
      const resolveRetailer = (provider: string, slug: string): string | null => {
        const key = `${provider}:${slug}`;
        if (confirmedMap.has(key)) return confirmedMap.get(key) ?? null;
        if (dbMap.has(key)) return dbMap.get(key) ?? null;
        if (SLUG_TO_RETAILER_ID[slug]) return SLUG_TO_RETAILER_ID[slug];
        return null;
      };

      // Upsert changed/new assignments
      for (const assignment of confirmedAssignments) {
        const current = dbMap.get(`${assignment.provider}:${assignment.slug}`);
        const hasChanged = current !== assignment.retailer_id;
        const isNew = !dbMap.has(`${assignment.provider}:${assignment.slug}`);
        if (hasChanged || isNew) {
          await client.query(
            `INSERT INTO auction_slug_assignments (provider, slug, retailer_id, assigned_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (provider, slug) DO UPDATE
               SET retailer_id = EXCLUDED.retailer_id,
                   assigned_by = EXCLUDED.assigned_by`,
            [assignment.provider, assignment.slug, assignment.retailer_id, session.user.id ?? 'system'],
          );
        }
      }

      // Pre-compute: for each (provider, slug, month_str), which customer_id is preferred.
      // In transition months (multiple accounts for same slug+month):
      //   - If exactly one account is a shared CSS account, prefer the dedicated one.
      //   - If both/all are dedicated, pick the one with the lexicographically smallest
      //     customer_id as a deterministic tiebreak (established/original account).
      // This ensures at most ONE account is preferred per slug/month.
      const preferredCustomerIdForSlotKey = new Map<string, string>(); // "provider:slug:month" → customer_id
      for (const [slotKey, customerIds] of slugMonthAccounts.entries()) {
        if (customerIds.size <= 1) {
          // Not a transition — the only account is preferred.
          const [onlyId] = customerIds;
          preferredCustomerIdForSlotKey.set(slotKey, onlyId);
        } else {
          // Transition month: find the account name for each customer_id.
          const [provider, slug, month_str] = slotKey.split(':');
          // Gather account_name per customer_id for this slot.
          const customerToAccount = new Map<string, string>();
          for (const row of rows) {
            if (row.provider === provider && row.slug === slug && row.month_str === month_str) {
              customerToAccount.set(row.customer_id, row.account_name);
            }
          }
          // Prefer dedicated (non-shared) accounts; if still a tie, lowest customer_id wins.
          const dedicated = Array.from(customerIds).filter(
            cid => !SHARED_ACCOUNT_NAMES.has((customerToAccount.get(cid) ?? '').toLowerCase()),
          );
          const candidates = dedicated.length > 0 ? dedicated : Array.from(customerIds);
          candidates.sort(); // lexicographic — stable deterministic tiebreak
          preferredCustomerIdForSlotKey.set(slotKey, candidates[0]);
        }
      }

      // Build row metadata with resolution and deduplication BEFORE touching the DB.
      // Deduplicates by (retailer_id, month, campaign_name, shop_display_name) and
      // sets preferred_for_display such that only ONE account is preferred per slug/month.
      type RowMeta = {
        retailer_id: string | null;
        row: (typeof rows)[0];
        preferred_for_display: boolean;
        data_source: string;
      };

      const rowMetas: RowMeta[] = [];
      for (const row of rows) {
        if (!row.provider || !row.slug) continue;
        const retailer_id = resolveRetailer(row.provider, row.slug);
        const slotKey = `${row.provider}:${row.slug}:${row.month_str}`;
        const accountsForSlugMonth = slugMonthAccounts.get(slotKey) ?? new Set();
        const isTransition = accountsForSlugMonth.size > 1;
        const data_source = determineDatasource(row.account_name, isTransition);
        const preferredCid = preferredCustomerIdForSlotKey.get(slotKey);
        const preferred_for_display = row.customer_id === preferredCid;
        rowMetas.push({ retailer_id, row, preferred_for_display, data_source });
      }

      // Deduplicate: for each unique (retailer_id, month, campaign_name, shop_display_name),
      // keep the preferred_for_display=true row, or the first row encountered if none are preferred.
      const insertMap = new Map<string, RowMeta>();
      for (const meta of rowMetas) {
        const dedupKey = `${meta.retailer_id ?? 'null'}:${meta.row.month_str}:${meta.row.campaign_name}:${meta.row.shop_display_name}`;
        const prev = insertMap.get(dedupKey);
        if (!prev || (!prev.preferred_for_display && meta.preferred_for_display)) {
          insertMap.set(dedupKey, meta);
        }
      }

      // ── Retailer-level preferred resolution ──────────────────────────────────
      // The slot-key used above is (provider, slug, month). This correctly handles
      // transitions where the SAME slug appears in multiple customer accounts.
      // However, when a retailer has data from two DIFFERENT CSS platforms in the same
      // month (e.g. octer-arket AND fevuh-arket), both extract as slug="arket" but
      // different providers. Each (provider, slug) slot has only one account, so both
      // get preferred_for_display=true independently.
      //
      // This post-processing pass ensures at most ONE (provider, slug) pair is marked
      // preferred per (retailer_id, month).  Dedicated beats shared; lexicographic
      // tiebreak on "provider:slug".

      // Step 1 — collect all preferred (provider:slug) entries per retailer+month
      const preferredSlugsPerRetailerMonth = new Map<string, Map<string, string>>();
      // key1: "retailer_id:month_str", key2: "provider:slug", value: data_source
      for (const meta of insertMap.values()) {
        if (!meta.preferred_for_display || !meta.retailer_id) continue;
        const rmKey = `${meta.retailer_id}:${meta.row.month_str}`;
        const psKey = `${meta.row.provider}:${meta.row.slug}`;
        let slugMap = preferredSlugsPerRetailerMonth.get(rmKey);
        if (!slugMap) { slugMap = new Map(); preferredSlugsPerRetailerMonth.set(rmKey, slugMap); }
        if (!slugMap.has(psKey)) slugMap.set(psKey, meta.data_source);
      }

      // Step 2 — for each retailer+month with multiple preferred slugs, pick the winner
      const winningSlugPerRetailerMonth = new Map<string, string>();
      for (const [rmKey, slugToDataSource] of preferredSlugsPerRetailerMonth.entries()) {
        if (slugToDataSource.size === 1) {
          const [onlyKey] = slugToDataSource.keys();
          winningSlugPerRetailerMonth.set(rmKey, onlyKey);
        } else {
          // Sort: dedicated (-1) before shared/transition (0), then lexicographic
          const candidates = Array.from(slugToDataSource.entries());
          candidates.sort(([keyA, dsA], [keyB, dsB]) => {
            const scoreA = dsA === 'dedicated' ? -1 : 0;
            const scoreB = dsB === 'dedicated' ? -1 : 0;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return keyA.localeCompare(keyB);
          });
          winningSlugPerRetailerMonth.set(rmKey, candidates[0][0]);
          console.log(`[auction-import] retailer-month conflict ${rmKey}: winner=${candidates[0][0]}, demoted=${candidates.slice(1).map(c => c[0]).join(', ')}`);
        }
      }

      // Apply explicit user overrides (from preferred_overrides param).
      // These override algortithmic choice — key uses \"::\": \"retailer_id::month_str\" → \"provider:slug\"
      for (const [overrideKey, psKey] of explicitWinnerMap.entries()) {
        const [retailer_id, month_str] = overrideKey.split('::');
        const rmKey = `${retailer_id}:${month_str}`;
        if (winningSlugPerRetailerMonth.has(rmKey) && winningSlugPerRetailerMonth.get(rmKey) !== psKey) {
          console.log(`[auction-import] override applied for ${rmKey}: ${winningSlugPerRetailerMonth.get(rmKey)} → ${psKey}`);
          winningSlugPerRetailerMonth.set(rmKey, psKey);
        }
      }

      // Step 3 — demote non-winning preferred rows
      const demotions: string[] = [];
      for (const [dedupKey, meta] of insertMap.entries()) {
        if (!meta.preferred_for_display || !meta.retailer_id) continue;
        const rmKey = `${meta.retailer_id}:${meta.row.month_str}`;
        const psKey = `${meta.row.provider}:${meta.row.slug}`;
        const winner = winningSlugPerRetailerMonth.get(rmKey);
        if (winner && winner !== psKey) demotions.push(dedupKey);
      }
      for (const k of demotions) {
        const meta = insertMap.get(k)!;
        insertMap.set(k, { ...meta, preferred_for_display: false });
      }
      if (demotions.length > 0) {
        console.log(`[auction-import] demoted ${demotions.length} rows to preferred_for_display=false (retailer-level conflict resolution)`);
      }

      // Collect the distinct (retailer_id, month) pairs that will actually be inserted.
      const resolvedPairsForInsert = new Map<string, string>(); // "rid:YYYY-MM" → "YYYY-MM-01"
      for (const { retailer_id, row } of insertMap.values()) {
        if (retailer_id) {
          resolvedPairsForInsert.set(`${retailer_id}:${row.month_str}`, `${row.month_str}-01`);
        }
      }

      console.log('[auction-import] overwriteFlag:', overwriteFlag);
      console.log('[auction-import] resolved pairs:', Array.from(resolvedPairsForInsert.keys()));
      console.log('[auction-import] rows to insert after dedup:', insertMap.size);

      // If overwrite: delete all existing rows for every (month, provider, slug) combo
      // in the file. Using provider+slug (not retailer_id) ensures we also remove rows
      // that were stored with retailer_id = NULL from a previous import where the slug
      // was unresolved, which would otherwise hit idx_auction_insights_unassigned_unique.
      if (overwriteFlag) {
        const slugMonthsToDelete = new Set<string>(); // "monthDate::provider::slug"
        for (const { row } of insertMap.values()) {
          slugMonthsToDelete.add(`${row.month_str}-01::${row.provider}::${row.slug}`);
        }
        for (const key of slugMonthsToDelete) {
          const [monthDate, provider, slug] = key.split('::');
          const del = await client.query(
            `DELETE FROM auction_insights WHERE month = $1::date AND provider = $2 AND slug = $3`,
            [monthDate, provider, slug],
          );
          console.log(`[auction-import] DELETE ${provider}/${slug} / ${monthDate}: ${del.rowCount} rows removed`);
        }
      } else {
        // Proactively check for conflicts using UNNEST join (reliable with parameterised queries).
        if (resolvedPairsForInsert.size > 0) {
          const rids: string[] = [];
          const months: string[] = [];
          for (const [pairKey, monthDate] of resolvedPairsForInsert) {
            rids.push(pairKey.split(':')[0]);
            months.push(monthDate);
          }
          const existing = await client.query<{ retailer_id: string; month: string }>(
            `SELECT DISTINCT a.retailer_id, to_char(a.month, 'YYYY-MM') AS month
             FROM auction_insights a
             JOIN (SELECT unnest($1::text[]) AS rid, unnest($2::date[]) AS m) AS p
               ON a.retailer_id = p.rid AND a.month = p.m`,
            [rids, months],
          );
          console.log('[auction-import] conflict check found:', existing.rows);
          if (existing.rows.length > 0) {
            throw Object.assign(
              new Error('conflict'),
              { conflicts: existing.rows },
            );
          }
        }
      }

      // Insert deduplicated rows
      let rowsInserted = 0;
      const retailerMonthsAffected = new Set<string>();

      for (const { retailer_id, row, preferred_for_display, data_source } of insertMap.values()) {
        await client.query(
          `INSERT INTO auction_insights
             (upload_id, retailer_id, month, account_name, customer_id, campaign_name,
              provider, slug, shop_display_name, is_self,
              impr_share, impr_share_is_estimate,
              outranking_share, overlap_rate,
              data_source, preferred_for_display)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            null,                // upload_id back-filled below
            retailer_id,
            row.month,
            row.account_name,
            row.customer_id,
            row.campaign_name,
            row.provider,
            row.slug,
            row.shop_display_name,
            row.is_self,
            row.impr_share,
            row.impr_share_is_estimate,
            row.outranking_share,
            row.overlap_rate,
            data_source,
            preferred_for_display,
          ],
        );
        rowsInserted++;
        if (retailer_id) retailerMonthsAffected.add(`${retailer_id}:${row.month_str}`);
      }

      // Create the upload audit record
      const matchedCount = Array.from(insertMap.values()).filter(m => m.retailer_id !== null).length;
      const unmatchedCount = insertMap.size - matchedCount;
      const monthsCovered = Array.from(new Set(rows.map(r => r.month_str))).sort();
      const retailerIds = Array.from(new Set(
        Array.from(insertMap.values())
          .filter(m => m.retailer_id !== null)
          .map(m => m.retailer_id as string),
      ));

      const uploadResult = await client.query<{ id: number }>(
        `INSERT INTO auction_uploads
           (filename, row_count_raw, row_count_matched, row_count_unmatched,
            months_covered, retailers_affected, uploaded_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          file.name,
          insertMap.size,
          matchedCount,
          unmatchedCount,
          monthsCovered,
          retailerIds,
          session.user.id ? parseInt(session.user.id, 10) || null : null,
          notes,
        ],
      );
      const uploadId = uploadResult.rows[0].id;

      // Back-fill upload_id on inscerted rows (set it now)
      await client.query(
        `UPDATE auction_insights SET upload_id = $1 WHERE upload_id IS NULL`,
        [uploadId],
      );

      return {
        upload_id: uploadId,
        rows_inserted: rowsInserted,
        months_imported: monthsCovered,
        retailers_affected: new Set(
          Array.from(retailerMonthsAffected).map(p => p.split(':')[0]),
        ).size,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Auction upload import error:', error);
    // Proactive conflict check throws { message: 'conflict', conflicts: [...] }
    if (error instanceof Error && error.message === 'conflict') {
      const conflicts = (error as Error & { conflicts?: unknown }).conflicts;
      return NextResponse.json(
        { error: 'Data already exists for the following periods.', conflicts },
        { status: 409 },
      );
    }
    // Constraint violation fallback (shouldn't normally reach here)
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'Data already exists for this period. Set overwrite=true to replace it.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
