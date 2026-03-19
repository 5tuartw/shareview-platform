export type SourceDomain = 'overview' | 'keywords' | 'categories' | 'products' | 'auctions'

// Some retailers temporarily require a domain-specific source mapping while upstream
// source IDs are being normalised.
const OVERVIEW_SOURCE_OVERRIDES: Record<string, string> = {
}

export function resolveSourceRetailerIdForDomain(
  retailerId: string,
  defaultSourceRetailerId: string,
  domain: SourceDomain
): string {
  if (domain === 'overview') {
    return OVERVIEW_SOURCE_OVERRIDES[retailerId] ?? defaultSourceRetailerId
  }

  return defaultSourceRetailerId
}