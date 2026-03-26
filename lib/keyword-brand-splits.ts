import { normalizeBrandCatalogValue } from './brand-catalog'

export const BRAND_SPLIT_SCOPE_VALUES = [
  'retailer',
  'retailer_and_owned',
  'retailer_owned_and_stocked',
] as const

export type BrandSplitScope = (typeof BRAND_SPLIT_SCOPE_VALUES)[number]

export const BRAND_SPLIT_CLASSIFICATION_VALUES = [
  'generic',
  'brand_and_term',
  'brand_only',
] as const

export type BrandSplitClassification = (typeof BRAND_SPLIT_CLASSIFICATION_VALUES)[number]

export interface BrandSplitVocabularyEntry {
  phrase: string
  label: string
  kind: 'retailer' | 'brand'
  brandId?: number | null
  brandType?: string | null
}

export interface BrandSplitMatch {
  phrase: string
  label: string
  kind: 'retailer' | 'brand'
  brandId: number | null
  brandType: string | null
}

export interface BrandSplitClassificationResult {
  normalizedSearchTerm: string
  classification: BrandSplitClassification
  matches: BrandSplitMatch[]
  leftoverText: string
}

const uniqueBy = <T, K>(items: T[], getKey: (item: T) => K): T[] => {
  const seen = new Set<K>()
  const result: T[] = []

  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

const removeMatchedPhrases = (normalizedSearchTerm: string, phrases: string[]): string => {
  let padded = ` ${normalizedSearchTerm} `

  for (const phrase of phrases) {
    const paddedPhrase = ` ${phrase} `

    while (padded.includes(paddedPhrase)) {
      padded = padded.replace(paddedPhrase, ' ')
    }
  }

  return padded.replace(/\s+/g, ' ').trim()
}

export function normaliseBrandSplitText(value: string): string {
  return normalizeBrandCatalogValue(value)
}

export function isBrandSplitScope(value: unknown): value is BrandSplitScope {
  return typeof value === 'string' && BRAND_SPLIT_SCOPE_VALUES.includes(value as BrandSplitScope)
}

export function isBrandSplitClassification(value: unknown): value is BrandSplitClassification {
  return (
    typeof value === 'string' &&
    BRAND_SPLIT_CLASSIFICATION_VALUES.includes(value as BrandSplitClassification)
  )
}

export function classifySearchTermByBrandSplit(
  searchTerm: string,
  vocabulary: BrandSplitVocabularyEntry[]
): BrandSplitClassificationResult {
  const normalizedSearchTerm = normaliseBrandSplitText(searchTerm)

  if (!normalizedSearchTerm) {
    return {
      normalizedSearchTerm,
      classification: 'generic',
      matches: [],
      leftoverText: '',
    }
  }

  const paddedSearchTerm = ` ${normalizedSearchTerm} `

  const matches = uniqueBy(
    vocabulary
      .filter((entry) => entry.phrase && paddedSearchTerm.includes(` ${entry.phrase} `))
      .sort((left, right) => right.phrase.length - left.phrase.length)
      .map((entry) => ({
        phrase: entry.phrase,
        label: entry.label,
        kind: entry.kind,
        brandId: entry.brandId ?? null,
        brandType: entry.brandType ?? null,
      })),
    (entry) => entry.phrase
  )

  if (matches.length === 0) {
    return {
      normalizedSearchTerm,
      classification: 'generic',
      matches: [],
      leftoverText: normalizedSearchTerm,
    }
  }

  const leftoverText = removeMatchedPhrases(
    normalizedSearchTerm,
    matches.map((entry) => entry.phrase)
  )

  return {
    normalizedSearchTerm,
    classification: leftoverText.length > 0 ? 'brand_and_term' : 'brand_only',
    matches,
    leftoverText,
  }
}