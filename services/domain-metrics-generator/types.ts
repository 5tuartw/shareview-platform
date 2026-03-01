export type MetricStatus = 'success' | 'warning' | 'critical'
export type ComponentType = 'page_headline' | 'metric_card' | 'quick_stats' | 'contextual_info'

export interface DomainMetricRecord {
  retailerId: string
  pageType: string
  tabName: string
  periodType: 'month' | 'week' | 'custom'
  periodStart: string
  periodEnd: string
  componentType: ComponentType
  componentData: Record<string, unknown>
  sourceSnapshotId?: number | null
  calculationMethod?: string
  isActive?: boolean
}

export interface PageHeadlineData {
  status: MetricStatus
  message: string
  subtitle?: string
  [key: string]: unknown
}

export interface MetricCardItem {
  label: string
  value: string
  change: number | null
  status: MetricStatus
  [key: string]: unknown
}

export interface MetricCardData {
  cards: MetricCardItem[]
  [key: string]: unknown
}

export interface QuickStatsItem {
  label: string
  value: string
  color: string
  [key: string]: unknown
}

export interface QuickStatsData {
  items: QuickStatsItem[]
  [key: string]: unknown
}

export interface ContextualInfoItem {
  label: string
  text: string
  [key: string]: unknown
}

export interface ContextualInfoData {
  title: string
  style: 'info' | 'warning' | 'critical'
  items: ContextualInfoItem[]
  [key: string]: unknown
}

export interface KeywordsSnapshot {
  id: number
  retailer_id: string
  range_start: string
  range_end: string
  total_keywords: number | null
  total_impressions: number | null
  total_clicks: number | null
  total_conversions: number | null
  overall_ctr: number | null
  overall_cvr: number | null
  tier_star_count: number | null
  tier_strong_count: number | null
  tier_underperforming_count: number | null
  tier_poor_count: number | null
  last_updated: string
}

export interface CategorySnapshot {
  id: number
  retailer_id: string
  range_start: string
  range_end: string
  total_categories: number | null
  total_impressions: number | null
  total_clicks: number | null
  total_conversions: number | null
  overall_ctr: number | null
  overall_cvr: number | null
  health_broken_count: number | null
  health_underperforming_count: number | null
  health_attention_count: number | null
  health_healthy_count: number | null
  health_star_count: number | null
  health_summary: Record<string, unknown> | null
  last_updated: string
}

export interface ProductSnapshot {
  id: number
  retailer_id: string
  range_start: string
  range_end: string
  total_products: number | null
  total_impressions: number | null
  total_clicks: number | null
  total_conversions: number | null
  avg_ctr: number | null
  avg_cvr: number | null
  products_with_conversions: number | null
  products_with_clicks_no_conversions: number | null
  clicks_without_conversions: number | null
  product_classifications: any | null
  star_count: number | null
  good_count: number | null
  underperformer_count: number | null
  top_1_pct_conversions_share: number | null
  top_5_pct_conversions_share: number | null
  top_10_pct_conversions_share: number | null
  products_with_wasted_clicks: number | null
  total_wasted_clicks: number | null
  wasted_clicks_percentage: number | null
  last_updated: string
}

export interface AuctionSnapshot {
  id: number
  retailer_id: string
  range_start: string
  range_end: string
  avg_impression_share: number | null
  total_competitors: number | null
  avg_overlap_rate: number | null
  avg_outranking_share: number | null
  avg_being_outranked: number | null
  top_competitor_id: string | null
  top_competitor_overlap_rate: number | null
  top_competitor_outranking_you: number | null
  biggest_threat_id: string | null
  biggest_threat_overlap_rate: number | null
  biggest_threat_outranking_you: number | null
  best_opportunity_id: string | null
  best_opportunity_overlap_rate: number | null
  best_opportunity_you_outranking: number | null
  last_updated: string
}

export interface CoverageSnapshot {
  id: number
  retailer_id: string
  range_start: string
  range_end: string
  total_products: number | null
  active_products: number | null
  zero_visibility_products: number | null
  coverage_pct: number | null
  top_category: Record<string, unknown> | null
  biggest_gap: Record<string, unknown> | null
  last_updated: string
}

export type SnapshotData = KeywordsSnapshot | CategorySnapshot | ProductSnapshot | AuctionSnapshot | CoverageSnapshot

export interface GeneratorOptions {
  retailer?: string
  month?: string
  dryRun?: boolean
  force?: boolean
}

export interface CalculationResult {
  metrics: DomainMetricRecord[]
  errors: string[]
}
