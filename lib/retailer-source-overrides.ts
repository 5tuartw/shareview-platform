export type SourceDomain = 'overview' | 'keywords' | 'categories' | 'products' | 'auctions'

// Some retailers temporarily require a domain-specific source mapping while upstream
// source IDs are being normalised.
const OVERVIEW_SOURCE_OVERRIDES: Record<string, string> = {
  // AllSaints overview data is keyed by dedicated network ID in RSR.
  allsaints: '45532',
  // Boots overview data remains keyed by the legacy AW network ID in RSR.
  boots: '2041',
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