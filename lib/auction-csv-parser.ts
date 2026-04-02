/**
 * Auction Insights CSV parser.
 *
 * Expected format:
 *   Line 1: "Auction Insights - last month" (preamble, skipped)
 *   Line 2: date range string (preamble, skipped)
 *   Line 3: header row — "Account name,Customer ID,Campaign,Shop display name,Month,
 *            Shopping Impr. share (Auction Insights),Shopping outranking share,Shopping overlap rate"
 *   Lines 4+: data rows
 *
 * Percentage values:
 *   "27.03%"  → 0.2703
 *   "< 10%"   → 0.05  (impr_share_is_estimate = true)
 *   "--"      → null  (no data)
 *
 * Month strings: "January 2026" → Date('2026-01-01')
 *
 * Campaign name format: "octer-boots~catchallredirect"
 *   → provider = "octer", slug = "boots"
 */

import { SHARED_ACCOUNT_NAMES } from './auction-slug-map';

export interface ParsedAuctionRow {
  account_name: string;
  customer_id: string;
  campaign_name: string;
  provider: string | null;
  slug: string | null;
  shop_display_name: string;
  month: Date;              // first day of month
  month_str: string;        // YYYY-MM
  is_self: boolean;
  impr_share: number | null;
  impr_share_is_estimate: boolean;
  outranking_share: number | null;
  overlap_rate: number | null;
}

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

/** "January 2026" → '2026-01' */
function parseMonthStr(raw: string): string | null {
  const parts = raw.trim().toLowerCase().split(/\s+/);
  if (parts.length === 2 && MONTH_MAP[parts[0]]) {
    return `${parts[1]}-${MONTH_MAP[parts[0]]}`;
  }
  return null;
}

/** "January 2026" → Date (first day of month, UTC midnight) */
function parseMonthDate(raw: string): Date | null {
  const str = parseMonthStr(raw);
  if (!str) return null;
  return new Date(`${str}-01T00:00:00Z`);
}

/**
 * Parse a percentage string.
 * Returns [value, isEstimate].
 * "< 10%" → [0.05, true]  (midpoint proxy)
 * "--"    → [null, false]
 * "27.03%" → [0.2703, false]
 */
function parseShare(raw: string | null | undefined): [number | null, boolean] {
  if (!raw) return [null, false];
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (s === '--' || s === '' || s === '-') return [null, false];
  if (s.startsWith('<')) return [0.05, true];
  const n = parseFloat(s.replace('%', ''));
  if (isNaN(n)) return [null, false];
  return [n / 100, false];
}

/**
 * Extract (provider, slug) from a campaign name.
 * "octer-boots~catchallredirect" → ["octer", "boots"]
 * Returns [null, null] if pattern does not match.
 */
function extractSlug(campaign: string): [string | null, string | null] {
  const m = campaign.trim().toLowerCase().match(/^([a-z0-9]+)-([a-z0-9&_.]+)/);
  if (m) return [m[1], m[2]];
  return [null, null];
}

/**
 * Fallback slug extraction from the CSS account name.
 * Used for dedicated accounts whose campaign names don't follow the
 * provider-slug~suffix pattern (e.g. "All Saints New", "M&S New").
 *
 * "AllSaints CSS"           → ["direct", "allsaints"]
 * "COS DE CSS"              → ["direct", "cosde"]
 * "BoohooMan DE CSS - GBP"  → ["direct", "boohoomande"]
 * "Land's End CSS"          → ["direct", "landsend"]
 */
function extractSlugFromAccount(
  accountName: string,
): [string | null, string | null] {
  // Strip " CSS" and any trailing region/currency modifiers after it
  const stripped = accountName.replace(/\s+css\b.*$/i, '').trim();
  if (!stripped) return [null, null];

  const slug = stripped
    .toLowerCase()
    .replace(/[''ʼ]/g, '')        // remove apostrophes
    .replace(/[^a-z0-9&]/g, '');  // remove spaces and other special chars

  if (!slug) return [null, null];
  return ['direct', slug];
}

/**
 * Naïve CSV line splitter that handles quoted fields.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  result.push(field);
  return result;
}

export interface ParseAuctionCSVResult {
  rows: ParsedAuctionRow[];
  /** Distinct (provider, slug) pairs found, with row counts */
  slugSummary: Array<{
    provider: string;
    slug: string;
    rowCount: number;
    months: string[];
  }>;
  /** Distinct months found */
  months: string[];
  parseErrors: number;
}

/**
 * Parse an auction insights CSV buffer.
 * Skips the 2-line preamble automatically by looking for the header row
 * (first line containing "Account name").
 */
export function parseAuctionCSV(buffer: Buffer): ParseAuctionCSVResult {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/);

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].toLowerCase().includes('account name')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Could not find header row in CSV (expected "Account name" within first 10 lines)');
  }

  const headers = splitCsvLine(lines[headerIdx]).map(h => h.trim());

  // Map header names to indices (case-insensitive, stripped)
  const h = (name: string): number => {
    const i = headers.findIndex(hdr => hdr.toLowerCase().includes(name.toLowerCase()));
    return i; // -1 if not found
  };

  const idxAccount    = h('account name');
  const idxCustomer   = h('customer id');
  const idxCampaign   = h('campaign');
  const idxShop       = h('shop display name');
  const idxMonth      = h('month');
  const idxImpr       = h('impr. share');
  const idxOutranking = h('outranking');
  const idxOverlap    = h('overlap rate');

  if (idxAccount === -1 || idxCampaign === -1 || idxMonth === -1) {
    throw new Error(`Missing required CSV columns. Found headers: ${headers.join(', ')}`);
  }

  const rows: ParsedAuctionRow[] = [];
  const slugMap = new Map<string, { rowCount: number; months: Set<string> }>();
  const monthsSet = new Set<string>();
  let parseErrors = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = splitCsvLine(line);
    if (cols.length < 5) continue;

    const account_name     = (cols[idxAccount]    ?? '').trim();
    const customer_id      = (cols[idxCustomer]   ?? '').trim();
    const campaign_name    = (cols[idxCampaign]   ?? '').trim();
    const shop_display_name = (cols[idxShop]       ?? '').trim();
    const monthRaw         = (cols[idxMonth]       ?? '').trim();
    const imprRaw          = idxImpr !== -1    ? (cols[idxImpr]       ?? '') : '';
    const outrankRaw       = idxOutranking !== -1 ? (cols[idxOutranking] ?? '') : '';
    const overlapRaw       = idxOverlap !== -1  ? (cols[idxOverlap]    ?? '') : '';

    if (!account_name || !campaign_name || !monthRaw) {
      parseErrors++;
      continue;
    }

    const monthDate = parseMonthDate(monthRaw);
    const month_str = parseMonthStr(monthRaw);
    if (!monthDate || !month_str) {
      parseErrors++;
      continue;
    }

    let [provider, slug] = extractSlug(campaign_name);
    // Fallback: for dedicated (non-shared) accounts with non-standard campaign
    // names, derive the slug from the account name instead.
    if (
      provider === null &&
      slug === null &&
      !SHARED_ACCOUNT_NAMES.has(account_name.toLowerCase())
    ) {
      [provider, slug] = extractSlugFromAccount(account_name);
    }
    const is_self = shop_display_name.toLowerCase() === 'you';
    const [impr_share, impr_share_is_estimate] = parseShare(imprRaw);
    const [outranking_share] = is_self ? [null, false] : parseShare(outrankRaw);
    const [overlap_rate]     = is_self ? [null, false] : parseShare(overlapRaw);

    rows.push({
      account_name,
      customer_id,
      campaign_name,
      provider,
      slug,
      shop_display_name,
      month: monthDate,
      month_str,
      is_self,
      impr_share,
      impr_share_is_estimate,
      outranking_share,
      overlap_rate,
    });

    monthsSet.add(month_str);

    if (provider && slug) {
      const key = `${provider}:${slug}`;
      const existing = slugMap.get(key) ?? { rowCount: 0, months: new Set() };
      existing.rowCount++;
      existing.months.add(month_str);
      slugMap.set(key, existing);
    }
  }

  const slugSummary = Array.from(slugMap.entries()).map(([key, val]) => {
    const [provider, slug] = key.split(':');
    return {
      provider,
      slug,
      rowCount: val.rowCount,
      months: Array.from(val.months).sort(),
    };
  });

  return {
    rows,
    slugSummary,
    months: Array.from(monthsSet).sort(),
    parseErrors,
  };
}

/**
 * Determine the data_source for a campaign+account in a given month.
 * 'transition' — same slug appeared in multiple accounts this month
 * 'shared_account' — account name is in SHARED_ACCOUNT_NAMES
 * 'dedicated' — everything else
 */
export function determineDatasource(
  accountName: string,
  isTransitionMonth: boolean,
): 'dedicated' | 'shared_account' | 'transition' {
  if (isTransitionMonth) return 'transition';
  if (SHARED_ACCOUNT_NAMES.has(accountName.toLowerCase())) return 'shared_account';
  return 'dedicated';
}
