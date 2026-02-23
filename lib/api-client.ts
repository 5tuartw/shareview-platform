/**
 * API Client Functions - Phase 7 Placeholders
 * 
 * These functions return mock data for UI development.
 * Will be replaced with real API calls in Phase 8 (Migrate Analytics API Routes).
 * 
 * Real endpoints will be:
 * - GET /api/retailers/[id]/overview
 * - GET /api/retailers/[id]/keywords
 * - GET /api/retailers/[id]/categories
 * - GET /api/retailers/[id]/products
 * - GET /api/retailers/[id]/auctions
 */

import type {
  RetailerOverview,
  MonthlyMetricRow,
  KeywordPerformance,
  CategoryData,
  ProductsOverview,
  AuctionInsightsResponse,
} from '@/types'

export interface KeywordSummary {
  unique_search_terms: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  overall_ctr: number
  overall_conversion_rate: number
  terms_with_conversions: number
  terms_with_clicks: number
  tier_star: number
  tier_strong: number
  tier_underperforming: number
  tier_poor: number
}

export interface KeywordPerformanceResponse {
  keywords: KeywordPerformance[]
  summary: KeywordSummary
  headlines?: Array<{
    status: 'success' | 'warning' | 'critical'
    message: string
    subtitle: string
    filterAction: { tier: string; metric: string }
  }>
}

export interface CategorySummary {
  total_impressions: number
  total_clicks: number
  total_conversions: number
  overall_ctr: number | null
  overall_cvr: number | null
  level1_count: number
  level2_count: number
  level3_count: number
}

export interface HealthSummary {
  broken: { count: number; top_categories: CategoryData[] }
  underperforming: { count: number; top_categories: CategoryData[] }
  attention: { count: number; top_categories: CategoryData[] }
  healthy: { count: number; top_categories: CategoryData[] }
  star: { count: number; top_categories: CategoryData[] }
  none: { count: number; top_categories: CategoryData[] }
}

export interface CategoryResponse {
  categories: CategoryData[]
  summary: CategorySummary
  health_summary?: HealthSummary
  time_series?: Array<Record<string, unknown>>
  date_range: {
    start: string
    end: string
    days: number
  }
  navigation?: {
    current_parent: string | null
    current_depth: number
    showing_node_only: boolean
  }
  from_snapshot: boolean
  source: string
}

export interface CategoryTrend {
  category_level1: string
  category_level2: string
  category_level3: string
  recent_impressions: number
  previous_impressions: number
  recent_clicks: number
  previous_clicks: number
  recent_conversions: number
  previous_conversions: number
  impressions_change_pct: number
  clicks_change_pct: number
  conversions_change_pct: number
  recent_ctr: number
  previous_ctr: number
  recent_cvr: number
  previous_cvr: number
}

export interface TrendSummary {
  total_categories: number
  impressions: {
    trending_up: number
    trending_down: number
    stable: number
  }
  clicks: {
    trending_up: number
    trending_down: number
    stable: number
  }
  conversions: {
    trending_up: number
    trending_down: number
    stable: number
  }
}

export interface TrendsResponse {
  trends: CategoryTrend[]
  summary: TrendSummary
  date_ranges: {
    recent: { start: string; end: string }
    previous: { start: string; end: string }
  }
}

export interface ProductPerformance {
  product_title: string
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  cvr: number
  tier: 'star' | 'good'
}

export interface ProductUnderperformer {
  product_title: string
  impressions: number
  clicks: number
  ctr: number
}

export interface ProductPerformanceResponse {
  top_performers: ProductPerformance[]
  underperformers: ProductUnderperformer[]
}

export interface CompetitorDetail {
  name: string
  is_shareight: boolean
  days_seen: number
  avg_overlap_rate: number
  avg_you_outranking: number
  avg_them_outranking: number
  avg_their_impression_share: number | null
  impression_share_is_estimate: boolean
  max_overlap_rate: number
  max_them_outranking: number
}

export interface WordAnalysisResponse {
  words: Array<{
    word: string
    keyword_count: number
    keywords_with_clicks: number
    keywords_with_conversions: number
    total_impressions: number
    total_clicks: number
    total_conversions: number
    avg_ctr: number
    avg_cvr: number
    click_to_conversion_pct: number
    word_category: string
    performance_tier: string
  }>
  summary: {
    total_words: number
    star_words: number
    good_words: number
    dead_words: number
    poor_words: number
    average_words: number
    total_conversions: number
    total_clicks: number
    wasted_clicks: number
    analysis_date: string
  }
}

export async function fetchRetailerOverview(
  retailerId: string,
  period: '13-weeks' | '13-months' = '13-weeks'
): Promise<RetailerOverview> {
  // In development, you can set USE_MOCK_DATA=true to test UI without auth
  const useMockData = typeof window !== 'undefined' && (window as any).USE_MOCK_DATA === true
  
  if (useMockData) {
    // Return mock data for UI testing
    const weeks = period === '13-weeks' ? 13 : 52
    const weekly_trend = Array.from({ length: weeks }, (_, index) => ({
      week: `Week ${index + 1}`,
      date: new Date(Date.now() - (weeks - index - 1) * 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      gmv: 52000 + Math.random() * 25000,
      commission: 2400 + Math.random() * 1200,
      conversions: 780 + Math.random() * 360,
      impressions: 140000 + Math.random() * 45000,
      clicks: 7500 + Math.random() * 2800,
      profit: 1600 + Math.random() * 900,
      cvr: 4.5 + Math.random() * 2.5,
    }))

    return {
      retailer_id: retailerId,
      retailer_name: 'Retailer Client',
      network: 'Shopping8',
      metrics: {
        gmv: 640000,
        commission: 32000,
        conversions: 10100,
        impressions: 1850000,
        clicks: 98000,
        cvr: 9.6,
        validation_rate: 84.2,
        roi: 44.8,
        profit: 19200,
      },
      weekly_trend,
      last_updated: new Date().toISOString(),
    }
  }

  try {
    const viewType = period === '13-weeks' ? 'weekly' : 'monthly'
    // Always explicitly pass view_type to ensure cache bypass for weekly views
    const response = await fetch(
      `/api/retailers/${retailerId}/overview?view_type=${viewType}`,
      { 
        cache: 'no-store',
        credentials: 'include',
      }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to fetch overview: ${response.status}`)
    }

    const data = await response.json()
    
    // Transform API response to expected format
    return {
      retailer_id: data.retailer_id,
      retailer_name: data.retailer_name,
      network: data.network,
      metrics: data.metrics,
      weekly_trend: data.history || [],
      last_updated: data.last_updated,
    }
  } catch (error) {
    console.error('Error fetching retailer overview:', error)
    throw error
  }
}

export async function fetchRetailerMonthlyData(
  retailerId: string
): Promise<{ data: MonthlyMetricRow[] }> {
  // In development, you can set USE_MOCK_DATA=true to test UI without auth
  const useMockData = typeof window !== 'undefined' && (window as any).USE_MOCK_DATA === true
  
  if (useMockData) {
    // Return mock monthly data for UI testing
    const months = ['Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025']
    const data = months.map((month, index) => ({
      report_month: month,
      retailer_name: 'Retailer Client',
      network: 'Shopping8',
      gmv: 520000 + index * 35000,
      commission_validated: 26000 + index * 1500,
      profit: 15000 + index * 1000,
      impressions: 1400000 + index * 90000,
      google_clicks: 52000 + index * 2800,
      network_clicks: 24000 + index * 1400,
      google_conversions_transaction: 5200 + index * 300,
      network_conversions_transaction: 1900 + index * 120,
      conversion_rate: 6.2 + index * 0.2,
      validation_rate: 82 + index * 0.4,
      roi: 40 + index * 1.2,
      fetch_datetime: new Date().toISOString(),
    }))

    return { data }
  }

  try {
    const response = await fetch(
      `/api/retailers/${retailerId}/overview?view_type=monthly`,
      { 
        cache: 'no-store',
        credentials: 'include',
      }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to fetch monthly data: ${response.status}`)
    }

    const data = await response.json()
    
    // Transform API response monthly history
    const monthlyData = (data.history || []).map((item: any) => ({
      report_month: formatMonthFromDate(item.period_start),
      retailer_name: data.retailer_name,
      network: data.network,
      gmv: item.gmv,
      commission_validated: (item.gmv * 0.05) || 0, // estimate based on typical rate
      profit: item.profit,
      impressions: item.impressions,
      google_clicks: item.clicks,
      network_clicks: 0, // not in item
      google_conversions_transaction: item.conversions,
      network_conversions_transaction: 0, // not in item
      conversion_rate: item.cvr,
      validation_rate: item.validation_rate,
      roi: item.roi,
      fetch_datetime: data.last_updated,
    }))

    return { data: monthlyData }
  } catch (error) {
    console.error('Error fetching retailer monthly data:', error)
    throw error
  }
}

const formatMonthFromDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr)
    const month = date.toLocaleDateString('en-GB', { month: 'short' })
    const year = date.getFullYear()
    return `${month} ${year}`
  } catch {
    return dateStr
  }
}

export async function fetchKeywordPerformance(
  _retailerId: string,
  _params: { period?: string; metric?: string; tier?: string }
): Promise<KeywordPerformanceResponse> {
  const keywords: KeywordPerformance[] = Array.from({ length: 20 }, (_, index) => ({
    search_term: `Keyword ${index + 1}`,
    total_impressions: 2200 + index * 110,
    total_clicks: 180 + index * 12,
    total_conversions: 14 + index,
    ctr: 3.2 + index * 0.05,
    conversion_rate: 6.5 + index * 0.1,
    days_active: 18 + (index % 7),
    performance_tier: index < 4 ? 'star' : index < 10 ? 'strong' : index < 16 ? 'underperforming' : 'poor',
  }))

  return {
    keywords,
    summary: {
      unique_search_terms: 1560,
      total_impressions: 420000,
      total_clicks: 36500,
      total_conversions: 3200,
      overall_ctr: 8.7,
      overall_conversion_rate: 8.2,
      terms_with_conversions: 460,
      terms_with_clicks: 1200,
      tier_star: 120,
      tier_strong: 340,
      tier_underperforming: 620,
      tier_poor: 480,
    },
    headlines: [
      {
        status: 'warning',
        message: 'High impression terms are under-converting.',
        subtitle: 'Focus on the 120 terms with high CTR but low CVR.',
        filterAction: { tier: 'underperforming', metric: 'impressions' },
      },
    ],
  }
}

export async function fetchCategoryPerformance(
  retailerId: string,
  params?: { 
    depth?: number; 
    parent_path?: string;
    node_only?: boolean;
    period?: string;
  }
): Promise<CategoryResponse> {
  const queryParams = new URLSearchParams()
  if (params?.depth) queryParams.set('depth', params.depth.toString())
  if (params?.parent_path) queryParams.set('parent_path', params.parent_path)
  if (params?.node_only) queryParams.set('node_only', 'true')
  if (params?.period) queryParams.set('period', params.period)

  const url = `/api/retailers/${retailerId}/categories${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch category performance: ${response.statusText}`)
  }
  
  return response.json()
}

export async function fetchCategoryTrends(_retailerId: string): Promise<TrendsResponse> {
  return {
    trends: [
      {
        category_level1: 'Skincare',
        category_level2: 'Moisturisers',
        category_level3: 'Day Cream',
        recent_impressions: 120000,
        previous_impressions: 102000,
        recent_clicks: 6800,
        previous_clicks: 5900,
        recent_conversions: 520,
        previous_conversions: 480,
        impressions_change_pct: 17.6,
        clicks_change_pct: 15.3,
        conversions_change_pct: 8.3,
        recent_ctr: 5.6,
        previous_ctr: 5.1,
        recent_cvr: 7.6,
        previous_cvr: 7.3,
      },
    ],
    summary: {
      total_categories: 120,
      impressions: { trending_up: 36, trending_down: 18, stable: 66 },
      clicks: { trending_up: 28, trending_down: 22, stable: 70 },
      conversions: { trending_up: 24, trending_down: 12, stable: 84 },
    },
    date_ranges: {
      recent: { start: '2025-11-01', end: '2025-11-30' },
      previous: { start: '2025-10-01', end: '2025-10-30' },
    },
  }
}

export async function fetchProductsOverview(
  _retailerId: string,
  _period: string
): Promise<ProductsOverview> {
  return {
    total_products: 4200,
    total_conversions: 8600,
    avg_ctr: 3.6,
    avg_cvr: 6.8,
    top_1_pct_products: 42,
    top_1_pct_conversions_share: 22,
    top_5_pct_products: 210,
    top_5_pct_conversions_share: 46,
    top_10_pct_products: 420,
    top_10_pct_conversions_share: 62,
    star_products: 180,
    strong_products: 420,
    moderate_products: 980,
    underperforming_products: 1440,
    critical_products: 1180,
    top_products: [
      {
        product_title: 'Hero Product Set',
        impressions: 42000,
        clicks: 2800,
        ctr: 6.7,
        conversions: 520,
        cvr: 18.6,
        tier: 'star',
      },
    ],
    products_driving_50_pct: 210,
    products_driving_80_pct: 480,
    products_with_wasted_clicks: 640,
    total_wasted_clicks: 12000,
    wasted_clicks_percentage: 14.2,
    active_products: 3600,
    zero_visibility: 420,
    needs_attention: 320,
    top_by_cvr: [{ cvr: 18.6 }],
  }
}

export async function fetchProductPerformance(
  _retailerId: string,
  _period: string
): Promise<ProductPerformanceResponse> {
  return {
    top_performers: Array.from({ length: 12 }, (_, index) => ({
      product_title: `Product ${index + 1}`,
      impressions: 8200 - index * 300,
      clicks: 520 - index * 18,
      ctr: 6.2 - index * 0.1,
      conversions: 140 - index * 6,
      cvr: 18.5 - index * 0.4,
      tier: index < 6 ? 'star' : 'good',
    })),
    underperformers: Array.from({ length: 20 }, (_, index) => ({
      product_title: `Underperformer ${index + 1}`,
      impressions: 6200 - index * 140,
      clicks: 240 - index * 6,
      ctr: 4.1 - index * 0.05,
    })),
  }
}

export async function fetchAuctionInsights(
  _retailerId: string,
  days: number
): Promise<AuctionInsightsResponse> {
  return {
    overview: {
      avg_impression_share: 24.6,
      total_competitors: 18,
      avg_overlap_rate: 42.1,
      avg_outranking_share: 37.8,
      avg_being_outranked: 28.4,
    },
    top_competitor: {
      name: 'Competitor A',
      overlap_rate: 52.1,
      outranking_you: 34.6,
      you_outranking: 45.2,
    },
    biggest_threat: {
      name: 'Competitor B',
      overlap_rate: 48.3,
      outranking_you: 41.9,
      you_outranking: 28.1,
    },
    best_opportunity: {
      name: 'Competitor C',
      overlap_rate: 33.4,
      outranking_you: 18.7,
      you_outranking: 52.6,
    },
    date_range: {
      start: '2025-11-01',
      end: '2025-11-30',
      days,
    },
    source: 'mock',
  }
}

export async function fetchAuctionCompetitors(
  _retailerId: string,
  days: number
): Promise<CompetitorDetail[]> {
  return [
    {
      name: 'You (represented by Shareight)',
      is_shareight: true,
      days_seen: days,
      avg_overlap_rate: 0,
      avg_you_outranking: 0,
      avg_them_outranking: 0,
      avg_their_impression_share: 24.6,
      impression_share_is_estimate: false,
      max_overlap_rate: 0,
      max_them_outranking: 0,
    },
    {
      name: 'Competitor A',
      is_shareight: false,
      days_seen: days,
      avg_overlap_rate: 42.1,
      avg_you_outranking: 38.4,
      avg_them_outranking: 31.2,
      avg_their_impression_share: 18.5,
      impression_share_is_estimate: false,
      max_overlap_rate: 58.2,
      max_them_outranking: 44.7,
    },
  ]
}

export async function fetchPageInsights(
  _retailerId: string,
  _pageName: string,
  _componentType: string,
  _period?: string
): Promise<Record<string, unknown>> {
  return {
    insights: [
      {
        severity: 'opportunity',
        title: 'Expand high-intent queries',
        summary: 'Additional long-tail terms could drive incremental conversions.',
        details: ['Add more brand + product variations for peak demand ranges.'],
        actions: ['Review search term report for gaps.'],
        estimatedValue: '£22,000',
      },
    ],
  }
}

export async function fetchWordAnalysis(_retailerId: string): Promise<WordAnalysisResponse> {
  return {
    words: [
      {
        word: 'gift',
        keyword_count: 120,
        keywords_with_clicks: 86,
        keywords_with_conversions: 22,
        total_impressions: 56000,
        total_clicks: 3200,
        total_conversions: 210,
        avg_ctr: 5.7,
        avg_cvr: 6.6,
        click_to_conversion_pct: 6.5,
        word_category: 'seasonal',
        performance_tier: 'good',
      },
    ],
    summary: {
      total_words: 240,
      star_words: 22,
      good_words: 48,
      dead_words: 64,
      poor_words: 54,
      average_words: 52,
      total_conversions: 860,
      total_clicks: 6400,
      wasted_clicks: 920,
      analysis_date: new Date().toISOString(),
    },
  }
}
