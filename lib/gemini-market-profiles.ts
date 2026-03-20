import {
  MARKET_PROFILE_DOMAINS,
  sanitiseMarketProfileDomains,
  type MarketProfileDomains,
} from '@/lib/market-profiles';

const DEFAULT_MODEL = process.env.GEMINI_MARKET_PROFILE_MODEL || 'gemini-3-flash-preview';
const MAX_RETRIES = Number(process.env.GEMINI_REQUEST_MAX_RETRIES || 4);
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 45000);
const MAX_OUTPUT_TOKENS = 2048;

const FALLBACK_MODELS = [
  'gemini-2.5-flash',
];

export const MARKET_PROFILE_PROMPT_TEMPLATE_KEY = {
  page_type: 'market_profiles',
  tab_name: 'market_profiles',
  insight_type: 'domain_categorisation',
} as const;

export const DEFAULT_MARKET_PROFILE_PROMPT = `
You are a retail market analyst AI.

Classify exactly one retailer into a structured taxonomy for market analysis.

Return a single JSON object (not an array) with these fields:
- retailer
- format
- category (up to 3 entries; exactly one primary=true)
- segment (multi-label)
- price_tier
- confidence (0 to 1)

Use British English and valid JSON only.

Field constraints:
- format: one concise value.
- category: each entry must be {"name": string, "primary": boolean}.
- segment: array of concise audience labels.
- price_tier: one value from Luxury, Premium, Mid-Market, Value, Budget.
- confidence: decimal between 0 and 1.

Mapping into internal domains (must be respected):
- format -> retailer_format
- category names -> primary_category (ordered with primary category first)
- segment -> target_audience
- price_tier -> price_positioning
- other is user-controlled by staff only, so never infer or assign it
- region_focus is handled manually by the operations team, so do not infer or assign region
`;

const AI_MAPPED_DOMAIN_KEYS = [
  'retailer_format',
  'primary_category',
  'target_audience',
  'price_positioning',
] as const;

type AiMappedDomainKey = (typeof AI_MAPPED_DOMAIN_KEYS)[number];

export type GenerateAiMarketProfileResult = {
  domains: MarketProfileDomains;
  raw_text: string;
  parsed_json: unknown;
  model: string;
  missing_domain_keys: AiMappedDomainKey[];
};

const isLikelyTruncatedJson = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (!trimmed.startsWith('{')) return false;
  if (trimmed.endsWith('}')) return false;
  return true;
};

type RetailerProfileInput = {
  retailer_id: string;
  retailer_name: string;
  category: string | null;
  tier: string | null;
  status: string | null;
  sector: string | null;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const getApiKey = (apiKeyOverride?: string): string => {
  const key = apiKeyOverride || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Gemini API key missing. Set GEMINI_API_KEY.');
  }
  return key;
};

export const hasGeminiApiKeyConfigured = (): boolean => {
  return Boolean(process.env.GEMINI_API_KEY);
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
};

const stripFences = (text: string): string => {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};

const extractJsonTexts = (response: GeminiGenerateResponse): string[] => {
  const candidates = response.candidates ?? [];
  const texts = candidates
    .map((candidate) => {
      const parts = candidate.content?.parts ?? [];
      return stripFences(parts.map((part) => part.text || '').join('\n').trim());
    })
    .filter((text) => text.length > 0);

  if (texts.length === 0) {
    throw new Error('Gemini response did not contain text output.');
  }

  return texts;
};

const normaliseJsonCandidate = (text: string): string => {
  return text
    // Smart quotes occasionally appear in preview models.
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Remove trailing commas before object/array close.
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

  if (inString) {
    repaired += '"';
  }

  // If we ended right after a value in an object/array context, drop any trailing comma.
  repaired = repaired.replace(/,\s*$/, '');

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    repaired += stack[i] === '{' ? '}' : ']';
  }

  return repaired;
};

const parseJsonLenient = (text: string): unknown => {
  const direct = normaliseJsonCandidate(text);
  const candidates = [direct, autoCloseJsonCandidate(direct)];

  // Try parsing just the largest object block if extra non-JSON text leaked in.
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

  if (lastError?.message?.toLowerCase().includes('unterminated string') ||
      lastError?.message?.toLowerCase().includes('unexpected end of json input')) {
    const snippet = direct.slice(0, 800).replace(/\s+/g, ' ');
    throw new Error(`Model returned truncated JSON: ${lastError.message}. Raw snippet: ${snippet}`);
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
  // The model may return either the internal domain shape or taxonomy shape.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Gemini JSON output must be an object.');
  }

  const record = raw as Record<string, unknown>;

  const candidate: Record<string, { values: string[]; assignment_method: 'ai' }> = {};

  // 1) Direct domain-shaped fields (if prompt/editor asks for these directly)
  for (const domain of MARKET_PROFILE_DOMAINS) {
    const value = record[domain.key];

    if (Array.isArray(value)) {
      const values = value.filter((item): item is string => typeof item === 'string');
      candidate[domain.key] = {
        values,
        assignment_method: 'ai',
      };
      continue;
    }

    if (typeof value === 'string') {
      candidate[domain.key] = {
        values: [value],
        assignment_method: 'ai',
      };
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const inner = value as { values?: unknown };
      const values = Array.isArray(inner.values)
        ? inner.values.filter((item): item is string => typeof item === 'string')
        : [];
      candidate[domain.key] = {
        values,
        assignment_method: 'ai',
      };
    }
  }

  // 2) Taxonomy-shaped fields mapped into current internal domains.
  const formatValue = record.format;
  if (typeof formatValue === 'string') {
    candidate.retailer_format = {
      values: [formatValue],
      assignment_method: 'ai',
    };
  }

  const categoryValue = record.category;
  if (Array.isArray(categoryValue)) {
    const mapped = categoryValue
      .map((item) => {
        if (typeof item === 'string') {
          return { name: item, primary: false };
        }

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
      candidate.primary_category = {
        values: mapped,
        assignment_method: 'ai',
      };
    }
  }

  const segmentValue = record.segment;
  if (Array.isArray(segmentValue)) {
    const values = segmentValue.filter((item): item is string => typeof item === 'string');
    candidate.target_audience = {
      values,
      assignment_method: 'ai',
    };
  }

  const priceTierValue = record.price_tier;
  if (typeof priceTierValue === 'string') {
    candidate.price_positioning = {
      values: [priceTierValue],
      assignment_method: 'ai',
    };
  }

  // Other and region are staff-controlled, so ignore any AI-provided values.
  delete candidate.other;
  delete candidate.region_focus;

  const sanitised = sanitiseMarketProfileDomains(candidate, 'ai');
  if (Object.keys(sanitised).length === 0) {
    throw new Error('Gemini returned no usable market profile domains.');
  }

  const missingDomainKeys = AI_MAPPED_DOMAIN_KEYS.filter((key) => !sanitised[key]);

  return {
    domains: sanitised,
    missingDomainKeys,
  };
};

class GeminiRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'GeminiRequestError';
    this.retryable = retryable;
  }
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const isRetryableGeminiErrorMessage = (text: string): boolean => {
  const message = text.toLowerCase();
  return (
    message.includes('upstream request timeout') ||
    message.includes('deadline exceeded') ||
    message.includes('temporarily unavailable') ||
    message.includes('backend error')
  );
};

export const generateAiMarketProfile = async (
  retailer: RetailerProfileInput,
  existingOptionsByDomain: Record<string, string[]>,
  customPromptText?: string,
  options?: { model?: string; apiKey?: string }
): Promise<GenerateAiMarketProfileResult> => {
  const apiKey = getApiKey(options?.apiKey);
  const prompt = toPrompt(retailer, existingOptionsByDomain, customPromptText);

  const modelCandidates = [
    options?.model || DEFAULT_MODEL,
    ...FALLBACK_MODELS.filter((model) => model !== (options?.model || DEFAULT_MODEL)),
  ];

  let lastError: Error | null = null;
  let lastRawOutputSnippet: string | null = null;

  for (const model of modelCandidates) {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        clearTimeout(timeout);

        if (!response.ok) {
          const bodyText = await response.text();
          const message = `Gemini API ${response.status}: ${bodyText.slice(0, 300)}`;

          // If model is unavailable, try the next fallback model immediately.
          if (response.status === 404) {
            lastError = new Error(message);
            break;
          }

          const retryable = RETRYABLE_HTTP_STATUSES.has(response.status) || isRetryableGeminiErrorMessage(bodyText);
          throw new GeminiRequestError(message, retryable);
        }

        const payload = (await response.json()) as GeminiGenerateResponse;
        const jsonTexts = extractJsonTexts(payload);

        let parsedFromAnyCandidate = false;
        let candidateParseError: Error | null = null;

        for (const jsonText of jsonTexts) {
          lastRawOutputSnippet = jsonText.slice(0, 1200).replace(/\s+/g, ' ');
          try {
            if (isLikelyTruncatedJson(jsonText)) {
              throw new Error('Model returned truncated JSON before completion.');
            }

            const parsed = parseJsonLenient(jsonText) as unknown;
            const parsedDomains = parseToDomains(parsed);

            if (parsedDomains.missingDomainKeys.length > 0) {
              throw new Error(
                `Model returned incomplete domain mapping. Missing: ${parsedDomains.missingDomainKeys.join(', ')}`
              );
            }

            parsedFromAnyCandidate = true;
            return {
              domains: parsedDomains.domains,
              raw_text: jsonText,
              parsed_json: parsed,
              model,
              missing_domain_keys: parsedDomains.missingDomainKeys,
            };
          } catch (error) {
            candidateParseError = error instanceof Error ? error : new Error(String(error));
          }
        }

        if (!parsedFromAnyCandidate && candidateParseError) {
          throw candidateParseError;
        }

        throw new Error('Gemini returned candidates but none were parseable.');
      } catch (error) {
        let retryable = true;

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new GeminiRequestError(
            `Gemini request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
            true
          );
          retryable = true;
        } else if (error instanceof GeminiRequestError) {
          lastError = error;
          retryable = error.retryable;
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
          retryable = isRetryableGeminiErrorMessage(lastError.message);
        }

        if (attempt <= MAX_RETRIES && retryable) {
          await sleep(600 * attempt);
          continue;
        }

        break;
      }
    }
  }

  if (lastError) {
    const contextSuffix = lastRawOutputSnippet ? ` Last raw output snippet: ${lastRawOutputSnippet}` : '';
    throw new Error(`${lastError.message}${contextSuffix}`);
  }

  throw new Error('Gemini market profile generation failed.');
};
