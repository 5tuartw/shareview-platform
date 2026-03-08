import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasRole } from '@/lib/permissions';
import { query } from '@/lib/db';
import {
  MARKET_PROFILE_DOMAINS,
  countAssignedDomains,
  sanitiseMarketProfileDomains,
  type MarketProfileDomains,
  type MarketProfileStatus,
} from '@/lib/market-profiles';

type RetailerProfileRow = {
  retailer_id: string;
  retailer_name: string;
  category: string | null;
  tier: string | null;
  sector: string | null;
  status: string | null;
  data_activity_status: string | null;
  last_data_date: string | null;
  is_enrolled: boolean;
  is_active_retailer: boolean;
  profile_status: MarketProfileStatus | null;
  profile_assignment_mode: 'manual' | 'ai' | null;
  profile_domains: MarketProfileDomains | null;
  profile_updated_at: string | null;
  profile_confirmed_at: string | null;
  profile_last_ai_at: string | null;
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

const buildEmptyOptions = () => {
  const optionsByDomain: Record<string, string[]> = {};
  for (const domain of MARKET_PROFILE_DOMAINS) {
    optionsByDomain[domain.key] = [];
  }
  return optionsByDomain;
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 }
      );
    }

    const migrationReady = await hasMarketProfileColumns();

    if (!migrationReady) {
      const fallbackRows = await query<Pick<RetailerProfileRow, 'retailer_id' | 'retailer_name' | 'category' | 'tier' | 'sector' | 'status' | 'data_activity_status' | 'last_data_date' | 'is_enrolled' | 'is_active_retailer'>>(`
        SELECT retailer_id, retailer_name, category, tier, sector, status, COALESCE(data_activity_status, 'inactive') AS data_activity_status,
               last_data_date::text AS last_data_date,
               COALESCE(snapshot_enabled, false) AS is_enrolled,
               (
                 COALESCE(data_activity_status, 'inactive') = 'active'
                 OR COALESCE(last_data_date >= CURRENT_DATE - INTERVAL '3 months', false)
                 OR COALESCE(snapshot_enabled, false) = true
               ) AS is_active_retailer
        FROM retailers
        ORDER BY retailer_name
      `);

      return NextResponse.json({
        migration_ready: false,
        domains: MARKET_PROFILE_DOMAINS,
        options_by_domain: buildEmptyOptions(),
        counts: {
          unassigned: fallbackRows.rows.length,
          unconfirmed: 0,
        },
        retailers: fallbackRows.rows.map((row) => ({
          ...row,
          profile_status: 'unassigned',
          profile_assignment_mode: null,
          profile_domains: {},
          profile_updated_at: null,
          profile_confirmed_at: null,
          profile_last_ai_at: null,
          assigned_domain_count: 0,
        })),
      });
    }

    const rows = await query<RetailerProfileRow>(`
      SELECT
        retailer_id,
        retailer_name,
        category,
        tier,
        sector,
        status,
        COALESCE(data_activity_status, 'inactive') AS data_activity_status,
        last_data_date::text AS last_data_date,
        COALESCE(snapshot_enabled, false) AS is_enrolled,
        (
          COALESCE(data_activity_status, 'inactive') = 'active'
          OR COALESCE(last_data_date >= CURRENT_DATE - INTERVAL '3 months', false)
          OR COALESCE(snapshot_enabled, false) = true
        ) AS is_active_retailer,
        COALESCE(profile_status, 'unassigned') AS profile_status,
        profile_assignment_mode,
        COALESCE(profile_domains, '{}'::jsonb) AS profile_domains,
        profile_updated_at,
        profile_confirmed_at,
        profile_last_ai_at
      FROM retailers
      ORDER BY retailer_name
    `);

    const optionsByDomain = buildEmptyOptions();
    const optionBuckets = new Map<string, Set<string>>();
    for (const domain of MARKET_PROFILE_DOMAINS) {
      optionBuckets.set(domain.key, new Set<string>());
    }

    const mappedRows = rows.rows.map((row) => {
      const sanitisedDomains = sanitiseMarketProfileDomains(row.profile_domains, row.profile_assignment_mode ?? 'manual');

      for (const [domainKey, domainData] of Object.entries(sanitisedDomains)) {
        const bucket = optionBuckets.get(domainKey);
        if (!bucket) continue;

        for (const value of domainData.values) {
          bucket.add(value);
        }
      }

      return {
        ...row,
        profile_domains: sanitisedDomains,
        assigned_domain_count: countAssignedDomains(sanitisedDomains),
      };
    });

    for (const domain of MARKET_PROFILE_DOMAINS) {
      const options = Array.from(optionBuckets.get(domain.key) ?? []).sort((a, b) => a.localeCompare(b));
      optionsByDomain[domain.key] = options;
    }

    const counts = mappedRows.reduce(
      (acc, row) => {
        if (row.profile_status === 'unassigned') {
          acc.unassigned += 1;
        } else if (row.profile_status === 'pending_confirmation') {
          acc.unconfirmed += 1;
        }
        return acc;
      },
      { unassigned: 0, unconfirmed: 0 }
    );

    return NextResponse.json({
      migration_ready: true,
      domains: MARKET_PROFILE_DOMAINS,
      options_by_domain: optionsByDomain,
      counts,
      retailers: mappedRows,
    });
  } catch (error) {
    console.error('Market profiles list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
