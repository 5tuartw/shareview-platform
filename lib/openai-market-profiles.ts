import {
  MARKET_PROFILE_DOMAINS,
  sanitiseMarketProfileDomains,
  type MarketProfileDomains,
} from '@/lib/market-profiles';
import { DEFAULT_MARKET_PROFILE_PROMPT, type GenerateAiMarketProfileResult } from '@/lib/gemini-market-profiles';

const DEFAULT_MODEL = process.env.OPENAI_MARKET_PROFILE_MODEL || 'gpt-4.1-mini';
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_OUTPUT_TOKENS = 1400;

const AI_MAPPED_DOMAIN_KEYS = [
  'retailer_format',
  'primary_category',
  'target_audience',
  'price_positioning',
] as const;

type AiMappedDomainKey = (typeof AI_MAPPED_DOMAIN_KEYS)[number];

type RetailerProfileInput = {
  retailer_id: string;
  retailer_name: string;
  category: string | null;
  tier: string | null;
  status: string | null;
  sector: string | null;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
};

const normaliseJsonCandidate = (text: string): string => {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
};

const autoCloseJsonCandidate = (text: string): string => {
  const input = text.trim();
  if (!input) return input;

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of input) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' && stack[stack.length - 1] === '{') {
      stack.pop();
    } else if (ch === ']' && stack[stack.length - 1] === '[') {
      stack.pop();
    }
  }

  let repaired = input;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, '');

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    repaired += stack[i] === '{' ? '}' : ']';
  }

  return repaired;
};

const parseJsonLenient = (text: string): unknown => {
  const direct = normaliseJsonCandidate(text);
  const candidates = [direct, autoCloseJsonCandidate(direct)];

  const firstBrace = direct.indexOf('{');
  const lastBrace = direct.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = direct.slice(firstBrace, lastBrace + 1);
    candidates.push(sliced, autoCloseJsonCandidate(sliced));
  }

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('Invalid JSON response from model.');
};

const toPrompt = (
  retailer: RetailerProfileInput,
  existingOptionsByDomain: Record<string, string[]>,
  customPromptText?: string
): string => {
  const domainInstructions = MARKET_PROFILE_DOMAINS.map((domain) => {
    const options = existingOptionsByDomain[domain.key] ?? [];
    const optionsText = options.length > 0 ? options.join(', ') : 'No existing options yet';
    return `- ${domain.key}: ${domain.label}. Existing options: ${optionsText}`;
  }).join('\n');

  return [
    (customPromptText || DEFAULT_MARKET_PROFILE_PROMPT).trim(),
    '',
    'Non-negotiable output requirements:',
    'Return strict JSON only with this structure:',
    '{',
    '  "retailer_format": ["..."],',
    '  "primary_category": ["..."],',
    '  "target_audience": ["..."],',
    '  "price_positioning": ["..."],',
    '}',
    'Rules:',
    '- Arrays must contain 1 to 3 concise strings.',
    '- Do not include other in the output (other is staff-controlled).',
    '- Do not include region_focus in the output (region is assigned manually).',
    '- Prefer existing options where suitable but you may create new values if needed.',
    '- Use British English.',
    '- Do not include explanations or markdown.',
    '',
    `Retailer ID: ${retailer.retailer_id}`,
    `Retailer name: ${retailer.retailer_name}`,
    `Category: ${retailer.category ?? 'Unknown'}`,
    `Tier: ${retailer.tier ?? 'Unknown'}`,
    `Status: ${retailer.status ?? 'Unknown'}`,
    `Sector: ${retailer.sector ?? 'Unknown'}`,
    '',
    'Domain definitions and existing options:',
    domainInstructions,
  ].join('\n');
};

const parseToDomains = (raw: unknown): {
  domains: MarketProfileDomains;
  missingDomainKeys: AiMappedDomainKey[];
} => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('OpenAI JSON output must be an object.');
  }

  const record = raw as Record<string, unknown>;
  const candidate: Record<string, { values: string[]; assignment_method: 'ai' }> = {};

  for (const domain of MARKET_PROFILE_DOMAINS) {
    const value = record[domain.key];

    if (Array.isArray(value)) {
      const values = value.filter((item): item is string => typeof item === 'string');
      candidate[domain.key] = { values, assignment_method: 'ai' };
      continue;
    }

    if (typeof value === 'string') {
      candidate[domain.key] = { values: [value], assignment_method: 'ai' };
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const inner = value as { values?: unknown };
      const values = Array.isArray(inner.values)
        ? inner.values.filter((item): item is string => typeof item === 'string')
        : [];
      candidate[domain.key] = { values, assignment_method: 'ai' };
    }
  }

  const formatValue = record.format;
  if (typeof formatValue === 'string') {
    candidate.retailer_format = { values: [formatValue], assignment_method: 'ai' };
  }

  const categoryValue = record.category;
  if (Array.isArray(categoryValue)) {
    const mapped = categoryValue
      .map((item) => {
        if (typeof item === 'string') return { name: item, primary: false };
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const obj = item as { name?: unknown; primary?: unknown };
          return {
            name: typeof obj.name === 'string' ? obj.name : '',
            primary: obj.primary === true,
          };
        }
        return { name: '', primary: false };
      })
      .filter((item) => item.name.trim().length > 0)
      .sort((a, b) => Number(b.primary) - Number(a.primary))
      .slice(0, 3)
      .map((item) => item.name);

    if (mapped.length > 0) {
      candidate.primary_category = { values: mapped, assignment_method: 'ai' };
    }
  }

  const segmentValue = record.segment;
  if (Array.isArray(segmentValue)) {
    const values = segmentValue.filter((item): item is string => typeof item === 'string');
    candidate.target_audience = { values, assignment_method: 'ai' };
  }

  const priceTierValue = record.price_tier;
  if (typeof priceTierValue === 'string') {
    candidate.price_positioning = { values: [priceTierValue], assignment_method: 'ai' };
  }

  delete candidate.other;
  delete candidate.region_focus;

  const sanitised = sanitiseMarketProfileDomains(candidate, 'ai');
  if (Object.keys(sanitised).length === 0) {
    throw new Error('OpenAI returned no usable market profile domains.');
  }

  const missingDomainKeys = AI_MAPPED_DOMAIN_KEYS.filter((key) => !sanitised[key]);

  return { domains: sanitised, missingDomainKeys };
};

export const generateOpenAiMarketProfile = async (
  retailer: RetailerProfileInput,
  existingOptionsByDomain: Record<string, string[]>,
  customPromptText: string | undefined,
  options?: { model?: string; apiKey?: string }
): Promise<GenerateAiMarketProfileResult> => {
  const model = options?.model || DEFAULT_MODEL;
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key missing. Set OPENAI_API_KEY or configure api_key_env_var.');
  }

  const prompt = toPrompt(retailer, existingOptionsByDomain, customPromptText);

  let lastError: Error | null = null;
  let lastRawOutputSnippet: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`OpenAI API ${response.status}: ${bodyText.slice(0, 300)}`);
      }

      const payload = (await response.json()) as OpenAiResponse;
      const rawText = payload.choices?.[0]?.message?.content?.trim() || '';
      if (!rawText) {
        throw new Error('OpenAI response did not contain text output.');
      }

      lastRawOutputSnippet = rawText.slice(0, 1200).replace(/\s+/g, ' ');
      const parsed = parseJsonLenient(rawText) as unknown;
      const parsedDomains = parseToDomains(parsed);

      if (parsedDomains.missingDomainKeys.length > 0) {
        throw new Error(
          `Model returned incomplete domain mapping. Missing: ${parsedDomains.missingDomainKeys.join(', ')}`
        );
      }

      return {
        domains: parsedDomains.domains,
        raw_text: rawText,
        parsed_json: parsed,
        model,
        missing_domain_keys: parsedDomains.missingDomainKeys,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('OpenAI request timed out.');
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt <= MAX_RETRIES) {
        await sleep(500 * attempt);
      }
    }
  }

  if (lastError) {
    const contextSuffix = lastRawOutputSnippet ? ` Last raw output snippet: ${lastRawOutputSnippet}` : '';
    throw new Error(`${lastError.message}${contextSuffix}`);
  }

  throw new Error('OpenAI market profile generation failed.');
};
