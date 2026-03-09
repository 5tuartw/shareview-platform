import { query, transaction } from '@/lib/db';
import {
  MARKET_PROFILE_DOMAINS,
  sanitiseMarketProfileDomains,
} from '@/lib/market-profiles';
import {
  getAdminAiSettings,
  isProviderApiKeyConfigured,
  resolveProviderApiKey,
} from '@/lib/admin-ai-settings';
import {
  DEFAULT_MARKET_PROFILE_PROMPT,
  MARKET_PROFILE_PROMPT_TEMPLATE_KEY,
  generateAiMarketProfile,
  type GenerateAiMarketProfileResult,
} from '@/lib/gemini-market-profiles';
import { generateOpenAiMarketProfile } from '@/lib/openai-market-profiles';

export type RetailerSourceRow = {
  retailer_id: string;
  retailer_name: string;
  category: string | null;
  tier: string | null;
  status: string | null;
  sector: string | null;
};

export type AiAssignmentResult = {
  retailer_id: string;
  retailer_name: string;
  provider: 'gemini' | 'openai';
  model: string;
  raw_text: string;
  parsed_json: unknown;
  mapped_domains: Record<string, unknown>;
  missing_domain_keys: string[];
};

export type AiAssignmentFailure = {
  retailer_id: string;
  reason: string;
};

export type AiAssignmentSummary = {
  updated: number;
  failed: AiAssignmentFailure[];
  results: AiAssignmentResult[];
  provider: 'gemini' | 'openai';
  configured_model: string;
};

export async function hasMarketProfileColumns(): Promise<boolean> {
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

export async function assignMarketProfilesWithAi(retailerIds: string[]): Promise<AiAssignmentSummary> {
  const aiResponseColumnsReady = await hasAiResponseColumns();

  const aiSettings = await getAdminAiSettings();
  const providerApiKey = resolveProviderApiKey(aiSettings);

  if (!isProviderApiKeyConfigured(aiSettings)) {
    throw new Error(
      aiSettings.provider === 'openai'
        ? 'OpenAI API key is missing. Set OPENAI_API_KEY or configure api_key_env_var.'
        : 'Gemini API key is missing. Set GEMINI_API_KEY/GOOGLE_API_KEY or configure api_key_env_var.'
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
  const failedRetailers: AiAssignmentFailure[] = [];
  const assignmentResults: AiAssignmentResult[] = [];

  for (const retailerId of retailerIds) {
    if (!byRetailerId.has(retailerId)) {
      failedRetailers.push({ retailer_id: retailerId, reason: 'Retailer not found' });
    }
  }

  for (const retailerId of retailerIds) {
    const row = byRetailerId.get(retailerId);
    if (!row) continue;

    try {
      const llmResult = aiSettings.provider === 'openai'
        ? await generateOpenAiMarketProfile(row, existingOptionsByDomain, promptText, {
            model: aiSettings.model,
            apiKey: providerApiKey || undefined,
          })
        : await generateAiMarketProfile(row, existingOptionsByDomain, promptText, {
            model: aiSettings.model,
            apiKey: providerApiKey || undefined,
          });

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
    return {
      updated: 0,
      failed: failedRetailers,
      results: assignmentResults,
      provider: aiSettings.provider,
      configured_model: aiSettings.model,
    };
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
              provider: aiSettings.provider,
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
        provider: aiSettings.provider,
        model: update.llmResult.model,
        raw_text: update.llmResult.raw_text,
        parsed_json: update.llmResult.parsed_json,
        mapped_domains: update.suggestedDomains,
        missing_domain_keys: update.llmResult.missing_domain_keys,
      });
    }
  });

  return {
    updated: updates.length,
    failed: failedRetailers,
    results: assignmentResults,
    provider: aiSettings.provider,
    configured_model: aiSettings.model,
  };
}
