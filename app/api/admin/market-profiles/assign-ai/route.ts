import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasRole } from '@/lib/permissions';
import { query, transaction } from '@/lib/db';
import {
  MARKET_PROFILE_DOMAINS,
  sanitiseMarketProfileDomains,
} from '@/lib/market-profiles';
import {
  DEFAULT_MARKET_PROFILE_PROMPT,
  MARKET_PROFILE_PROMPT_TEMPLATE_KEY,
  generateAiMarketProfile,
  type GenerateAiMarketProfileResult,
  hasGeminiApiKeyConfigured,
} from '@/lib/gemini-market-profiles';

type RetailerSourceRow = {
  retailer_id: string;
  retailer_name: string;
  category: string | null;
  tier: string | null;
  status: string | null;
  sector: string | null;
};

type RequestBody = {
  retailer_ids?: string[];
};

type AiAssignmentResult = {
  retailer_id: string;
  retailer_name: string;
  model: string;
  raw_text: string;
  parsed_json: unknown;
  mapped_domains: Record<string, unknown>;
  missing_domain_keys: string[];
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

async function hasAiResponseColumns(): Promise<boolean> {
  const result = await query<{ has_columns: boolean }>(`
    SELECT (
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'profile_last_ai_response'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'profile_last_ai_model'
      )
    ) AS has_columns
  `);

  return result.rows[0]?.has_columns === true;
}

async function getMarketProfilePromptText(): Promise<string> {
  try {
    const tableResult = await query<{ has_table: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'prompt_templates'
      ) AS has_table
    `);

    if (tableResult.rows[0]?.has_table !== true) {
      return DEFAULT_MARKET_PROFILE_PROMPT;
    }

    const promptResult = await query<{ prompt_text: string }>(
      `
        SELECT prompt_text
        FROM prompt_templates
        WHERE page_type = $1
          AND tab_name = $2
          AND insight_type = $3
          AND is_active = true
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `,
      [
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.page_type,
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.tab_name,
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.insight_type,
      ]
    );

    return promptResult.rows[0]?.prompt_text || DEFAULT_MARKET_PROFILE_PROMPT;
  } catch {
    return DEFAULT_MARKET_PROFILE_PROMPT;
  }
}

export async function POST(request: Request) {
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
    const aiResponseColumnsReady = await hasAiResponseColumns();
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

    if (!hasGeminiApiKeyConfigured()) {
      return NextResponse.json(
        { error: 'Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY.' },
        { status: 400 }
      );
    }

    const sourceRows = await query<RetailerSourceRow>(
      `
        SELECT retailer_id, retailer_name, category, tier, status, sector
        FROM retailers
        WHERE retailer_id = ANY($1)
      `,
      [retailerIds]
    );

    const byRetailerId = new Map(sourceRows.rows.map((row) => [row.retailer_id, row]));

    const optionsResult = await query<{ profile_domains: unknown }>(`
      SELECT profile_domains
      FROM retailers
      WHERE profile_domains IS NOT NULL
    `);

    const existingOptionsByDomain: Record<string, string[]> = {};
    const optionBuckets = new Map<string, Set<string>>();
    for (const domain of MARKET_PROFILE_DOMAINS) {
      optionBuckets.set(domain.key, new Set<string>());
      existingOptionsByDomain[domain.key] = [];
    }

    for (const row of optionsResult.rows) {
      const sanitised = sanitiseMarketProfileDomains(row.profile_domains, 'ai');
      for (const [domainKey, domainValue] of Object.entries(sanitised)) {
        const bucket = optionBuckets.get(domainKey);
        if (!bucket) continue;

        for (const value of domainValue.values) {
          bucket.add(value);
        }
      }
    }

    for (const domain of MARKET_PROFILE_DOMAINS) {
      existingOptionsByDomain[domain.key] = Array.from(optionBuckets.get(domain.key) ?? []).sort((a, b) =>
        a.localeCompare(b)
      );
    }

    const promptText = await getMarketProfilePromptText();

    const updates: Array<{
      retailerId: string;
      suggestedDomains: Record<string, unknown>;
      llmResult: GenerateAiMarketProfileResult;
      retailerName: string;
    }> = [];
    const failedRetailers: Array<{ retailer_id: string; reason: string }> = [];
    const assignmentResults: AiAssignmentResult[] = [];

    for (const retailerId of retailerIds) {
      if (!byRetailerId.has(retailerId)) {
        failedRetailers.push({
          retailer_id: retailerId,
          reason: 'Retailer not found',
        });
      }
    }

    for (const retailerId of retailerIds) {
      const row = byRetailerId.get(retailerId);
      if (!row) continue;

      try {
        const llmResult = await generateAiMarketProfile(row, existingOptionsByDomain, promptText);
        updates.push({
          retailerId,
          suggestedDomains: llmResult.domains,
          llmResult,
          retailerName: row.retailer_name,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[market-profiles][assign-ai] failed retailer=${retailerId} name=${row.retailer_name}: ${reason}`);
        failedRetailers.push({ retailer_id: retailerId, reason });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({
        updated: 0,
        failed: failedRetailers,
        results: assignmentResults,
      });
    }

    await transaction(async (client) => {
      for (const update of updates) {
        if (aiResponseColumnsReady) {
          await client.query(
            `
              UPDATE retailers
              SET
                profile_domains = $2::jsonb,
                profile_assignment_mode = 'ai',
                profile_status = 'pending_confirmation',
                profile_last_ai_at = NOW(),
                profile_last_ai_response = $3::jsonb,
                profile_last_ai_model = $4,
                profile_confirmed_at = NULL,
                profile_updated_at = NOW(),
                updated_at = NOW()
              WHERE retailer_id = $1
            `,
            [
              update.retailerId,
              JSON.stringify(update.suggestedDomains),
              JSON.stringify({
                raw_text: update.llmResult.raw_text,
                parsed_json: update.llmResult.parsed_json,
                mapped_domains: update.suggestedDomains,
                missing_domain_keys: update.llmResult.missing_domain_keys,
              }),
              update.llmResult.model,
            ]
          );
        } else {
          await client.query(
            `
              UPDATE retailers
              SET
                profile_domains = $2::jsonb,
                profile_assignment_mode = 'ai',
                profile_status = 'pending_confirmation',
                profile_last_ai_at = NOW(),
                profile_confirmed_at = NULL,
                profile_updated_at = NOW(),
                updated_at = NOW()
              WHERE retailer_id = $1
            `,
            [update.retailerId, JSON.stringify(update.suggestedDomains)]
          );
        }

        assignmentResults.push({
          retailer_id: update.retailerId,
          retailer_name: update.retailerName,
          model: update.llmResult.model,
          raw_text: update.llmResult.raw_text,
          parsed_json: update.llmResult.parsed_json,
          mapped_domains: update.suggestedDomains,
          missing_domain_keys: update.llmResult.missing_domain_keys,
        });
      }
    });

    return NextResponse.json({
      updated: updates.length,
      failed: failedRetailers,
      results: assignmentResults,
    });
  } catch (error) {
    console.error('Assign AI market profiles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
