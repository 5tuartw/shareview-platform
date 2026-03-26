import { query } from '@/lib/db'

export const BRAND_CATALOG_MIGRATION_VERSION = '20260325000000'
export const BRAND_CLASSIFICATION_MIGRATION_VERSION = '20260326000000'

export const BRAND_TYPE_VALUES = ['3rd_party', 'retailer_exclusive', 'retailer_owned'] as const

export type BrandType = (typeof BRAND_TYPE_VALUES)[number]

export async function hasBrandCatalogTables(): Promise<boolean> {
  const result = await query<{ has_tables: boolean }>(`
    SELECT (
      to_regclass('public.brands') IS NOT NULL
      AND to_regclass('public.brand_aliases') IS NOT NULL
      AND to_regclass('public.retailer_brand_presence') IS NOT NULL
    ) AS has_tables
  `)

  return result.rows[0]?.has_tables === true
}

export function normalizeBrandCatalogValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function slugifyBrandCatalogValue(value: string): string {
  return normalizeBrandCatalogValue(value).replace(/ /g, '-')
}

export function isBrandType(value: unknown): value is BrandType {
  return typeof value === 'string' && BRAND_TYPE_VALUES.includes(value as BrandType)
}

export function getRetailerRelationshipType(
  brandType: BrandType,
  brandTypeRetailerId: string | null,
  retailerId: string,
): BrandType {
  if (brandType === '3rd_party') {
    return '3rd_party'
  }

  if (brandTypeRetailerId === retailerId) {
    return brandType
  }

  return '3rd_party'
}