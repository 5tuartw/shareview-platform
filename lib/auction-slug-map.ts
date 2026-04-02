/**
 * Auction campaign slug → retailer_id alias map.
 *
 * Campaign names follow the pattern `provider-slug~suffix`, e.g.:
 *   octer-hartsofstur~catchallredirect
 *   octer-m&s~cat_clothing
 *
 * When a slug directly matches a known retailer_id, no alias is needed.
 * This map covers slugs that differ from their retailer_id.
 *
 * Mirrors SLUG_TO_RETAILER_ID in scripts/analyse_auction_isolation.py and
 * the seed data in migrations/20260305020000_create_auction_tables_up.sql.
 * Keep all three in sync.
 */
export const SLUG_TO_RETAILER_ID: Record<string, string> = {
  'asdageorge':      'asda-george',
  'aspinal':         'aspinal-of-london',
  'beautyworks':       'beauty-works-online', // direct account "Beauty Works CSS"
  'benefitcosmetics':  'benefit-cosmetics-uk',
  'cosde':             'cos-de',
  'espa':              'espa-skincare-uk',
  'fitflop':           'fitflop-ltd',
  'fragranceshop':     'the-fragrance-shop',
  'hartsofstur':     'harts-of-stur',
  'harveynichols':   'harvey-nichols',
  'jdwilliams':      'jd-williams',
  'lounge':          'lounge-underwear',    // direct account "Lounge CSS"
  'loungeunderwear': 'lounge-underwear',
  'm&s':             'marks-and-spencer',
  'newera':          'new-era-cap',
  'nobodyschild':    'nobodys-child',
  'oasis':           'oasis-uk-ie',
  'petsathome':      'pets-at-home',
  'simplybe':        'simply-be',
  'tkmaxx':          'tk-maxx',
  // Accented/special character truncation aliases (regex stops at non-ASCII):
  'lanc':            'lancome',             // octer-lancôme → slug truncated at ô
};

// Provider+slug overrides for known one-off campaign naming anomalies.
const PROVIDER_SLUG_TO_RETAILER_ID: Record<string, string> = {
  'octer:feelunique': 'sephora',
};

/**
 * Account names that represent shared CSS providers (one account, many retailers).
 * Any account name NOT in this set is treated as a dedicated account.
 */
export const SHARED_ACCOUNT_NAMES = new Set<string>([
  'octer css',
  'fevuh css',
]);

/**
 * Build a reverse lookup: dehyphenated retailer_id → retailer_id.
 * e.g. "mintvelvet" → "mint-velvet", "landsend" → "land-s-end"
 * Called once at startup; the result is reused for every row.
 */
export function buildDehyphenatedMap(
  knownRetailerIds: Set<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of knownRetailerIds) {
    const key = id.replace(/-/g, '');
    if (key !== id && !map.has(key)) {
      map.set(key, id);
    }
  }
  return map;
}

/**
 * Attempt to resolve a campaign slug to a retailer_id.
 *
 * Resolution order:
 *  1. Provider+slug override (one-off anomalies)
 *  2. Exact match of slug against SLUG_TO_RETAILER_ID alias map
 *  3. Exact match of slug against knownRetailerIds set (slug == retailer_id)
 *  4. Dehyphenated match (slug == retailer_id with hyphens stripped)
 *  5. Null (unresolved — will be looked up in auction_slug_assignments DB at call time)
 *
 * @param slug - raw slug extracted from campaign name (lower-cased)
 * @param knownRetailerIds - set of all retailer_id values from DB
 * @param dehyphenatedMap - optional reverse map from buildDehyphenatedMap()
 */
export function resolveRetailerId(
  provider: string,
  slug: string,
  knownRetailerIds: Set<string>,
  dehyphenatedMap?: Map<string, string>,
): string | null {
  const providerAlias = PROVIDER_SLUG_TO_RETAILER_ID[`${provider}:${slug}`];
  if (providerAlias) return providerAlias;

  const alias = SLUG_TO_RETAILER_ID[slug];
  if (alias) return alias;
  if (knownRetailerIds.has(slug)) return slug;

  // Fallback: slug may be a retailer_id with hyphens stripped
  if (dehyphenatedMap) {
    const dehyphenated = dehyphenatedMap.get(slug);
    if (dehyphenated) return dehyphenated;
  }

  return null;
}
