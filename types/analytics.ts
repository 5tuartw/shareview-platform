export interface KeywordPerformance {
  search_term: string
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  conversion_rate: number
  performance_tier: string
  first_seen: string
  last_seen: string
}

export interface KeywordSummary {
  unique_search_terms: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  overall_ctr: number
  overall_cvr: number
  tier_star: number
  tier_strong: number
  tier_underperforming: number
  tier_poor: number
}

export interface WordAnalysis {
  word: string
  keyword_count: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  avg_ctr: number
  avg_cvr: number
  performance_tier: string
}

export interface CategoryPerformance {
  category: string
  category_level1: string | null
  category_level2: string | null
  category_level3: string | null
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cvr: number
  percentage: number
}

export interface CategorySummary {
  total_impressions: number
  total_clicks: number
  total_conversions: number
  overall_ctr: number
  overall_cvr: number
  category_count: number
}

export interface ProductOverview {
  total_products: number
  products_with_conversions: number
  total_gmv: number
  total_conversions: number
  avg_price: number
  top_1_pct_gmv_share: number
  top_5_pct_gmv_share: number
  top_10_pct_gmv_share: number
}

export interface ProductPerformance {
  product_name: string
  sku: string
  impressions: number
  clicks: number
  conversions: number
  gmv: number
  ctr: number
  cvr: number
}

export interface AuctionInsights {
  domain: string
  overlap_rate: number
  outranking_share: number
  impression_share: number
}

export interface CoverageMetrics {
  total_products: number
  coverage_rate: number
  zero_visibility: number
  low_visibility: number
  medium_visibility: number
  high_visibility: number
}
