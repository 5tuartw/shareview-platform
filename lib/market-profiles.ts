export type MarketProfileStatus = 'unassigned' | 'pending_confirmation' | 'confirmed';
export type MarketProfileAssignmentMethod = 'manual' | 'ai';

export type MarketProfileDomainKey =
  | 'retailer_format'
  | 'primary_category'
  | 'price_positioning'
  | 'target_audience'
  | 'business_model'
  | 'region_focus';

export interface MarketProfileDomainDefinition {
  key: MarketProfileDomainKey;
  label: string;
}

export interface MarketProfileDomainValue {
  values: string[];
  assignment_method: MarketProfileAssignmentMethod;
}

export type MarketProfileDomains = Partial<Record<MarketProfileDomainKey, MarketProfileDomainValue>>;

export const MARKET_PROFILE_DOMAINS: MarketProfileDomainDefinition[] = [
  { key: 'retailer_format', label: 'Retailer format' },
  { key: 'primary_category', label: 'Primary category' },
  { key: 'price_positioning', label: 'Price positioning' },
  { key: 'target_audience', label: 'Target audience' },
  { key: 'business_model', label: 'Business model' },
  { key: 'region_focus', label: 'Region focus' },
];

const DOMAIN_KEY_SET = new Set<MarketProfileDomainKey>(MARKET_PROFILE_DOMAINS.map((domain) => domain.key));

const normaliseValues = (values: string[] | undefined): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const cleanValues: string[] = [];

  for (const rawValue of values) {
    const trimmed = rawValue.trim();
    if (!trimmed) continue;

    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    cleanValues.push(trimmed);
  }

  return cleanValues;
};

export const sanitiseMarketProfileDomains = (
  input: unknown,
  assignmentMethodFallback: MarketProfileAssignmentMethod = 'manual'
): MarketProfileDomains => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const rawDomains = input as Record<string, unknown>;
  const sanitised: MarketProfileDomains = {};

  for (const [domainKey, domainValue] of Object.entries(rawDomains)) {
    if (!DOMAIN_KEY_SET.has(domainKey as MarketProfileDomainKey)) {
      continue;
    }

    if (!domainValue || typeof domainValue !== 'object' || Array.isArray(domainValue)) {
      continue;
    }

    const typedValue = domainValue as { values?: string[]; assignment_method?: string };
    const values = normaliseValues(typedValue.values);
    if (values.length === 0) continue;

    const assignmentMethod: MarketProfileAssignmentMethod =
      typedValue.assignment_method === 'ai' || typedValue.assignment_method === 'manual'
        ? typedValue.assignment_method
        : assignmentMethodFallback;

    sanitised[domainKey as MarketProfileDomainKey] = {
      values,
      assignment_method: assignmentMethod,
    };
  }

  return sanitised;
};

const CATEGORY_TO_PRIMARY: Record<string, string> = {
  beauty: 'Beauty',
  fashion: 'Fashion',
  electronics: 'Consumer electronics',
  home: 'Home and garden',
  sports: 'Sport and outdoor',
};

const TIER_TO_PRICE: Record<string, string> = {
  enterprise: 'Premium',
  premium: 'Premium',
  growth: 'Mid-market',
  standard: 'Value',
};

const STATUS_TO_MODEL: Record<string, string> = {
  active: 'Always-on',
  paused: 'Seasonal',
  testing: 'Testing',
};

export const buildAiProfileSuggestion = (retailer: {
  retailer_name: string;
  category: string | null;
  tier: string | null;
  status: string | null;
  sector: string | null;
}): MarketProfileDomains => {
  const category = retailer.category?.trim().toLowerCase() ?? '';
  const tier = retailer.tier?.trim().toLowerCase() ?? '';
  const status = retailer.status?.trim().toLowerCase() ?? '';

  const primaryCategory = CATEGORY_TO_PRIMARY[category] ?? (retailer.category?.trim() || 'General retail');
  const pricePositioning = TIER_TO_PRICE[tier] ?? 'Mid-market';
  const businessModel = STATUS_TO_MODEL[status] ?? 'Always-on';

  const formatValue = retailer.sector?.trim() || 'High street and online';
  const regionValue = 'UK and EU';
  const audienceValue = 'General consumers';

  return {
    retailer_format: {
      values: [formatValue],
      assignment_method: 'ai',
    },
    primary_category: {
      values: [primaryCategory],
      assignment_method: 'ai',
    },
    price_positioning: {
      values: [pricePositioning],
      assignment_method: 'ai',
    },
    target_audience: {
      values: [audienceValue],
      assignment_method: 'ai',
    },
    business_model: {
      values: [businessModel],
      assignment_method: 'ai',
    },
    region_focus: {
      values: [regionValue],
      assignment_method: 'ai',
    },
  };
};

export const countAssignedDomains = (domains: MarketProfileDomains): number => {
  return Object.values(domains).filter((domain) => domain && domain.values.length > 0).length;
};
