/**
 * Type definitions for ShareView Platform
 */

// ============================================================================
// User Types
// ============================================================================

export enum UserRole {
  CLIENT_VIEWER = 'CLIENT_VIEWER',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  SALES_TEAM = 'SALES_TEAM',
  CSS_ADMIN = 'CSS_ADMIN',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  retailerId?: string; // For CLIENT_VIEWER and CLIENT_ADMIN
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  user: User;
  expires: string;
}

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  full_name?: string;
  role: UserRole | string;
  retailerIds: string[];
}

export interface UpdateUserRequest {
  email?: string;
  username?: string;
  password?: string;
  full_name?: string;
  role?: UserRole | string;
  is_active?: boolean;
  retailerIds?: string[];
}

export interface RetailerAccess {
  retailer_id: string;
  retailer_name: string;
  access_level: string;
}

export interface UserResponse {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  retailerAccess: RetailerAccess[];
}

// ============================================================================
// Retailer Types
// ============================================================================

export interface Retailer {
  id: string;
  name: string;
  domain?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetailerMetadata {
  retailerId: string;
  commissionRate?: number;
  contractStartDate?: Date;
  contractEndDate?: Date;
  notes?: string;
}

export interface RetailerConfig {
  retailerId: string;
  visibleTabs: string[]; // e.g., ['overview', 'keywords', 'categories', 'products']
  visibleMetrics: string[]; // e.g., ['gmv', 'conversions', 'cvr', 'roi']
  keywordFilters?: {
    includePatterns?: string[];
    excludePatterns?: string[];
  };
  customBranding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
}

export interface RetailerConfigRequest {
  visible_tabs: string[];
  visible_metrics: string[];
  keyword_filters: string[];
  features_enabled: Record<string, boolean>;
}

export interface RetailerConfigResponse {
  retailer_id: string;
  visible_tabs: string[];
  visible_metrics: string[];
  keyword_filters: string[];
  features_enabled: Record<string, boolean>;
  updated_by: number | null;
  updated_at: string;
}

export interface RetailerOverview {
  retailer_id: string;
  retailer_name: string;
  network: string;
  view_type?: 'weekly' | 'monthly';
  metrics: {
    gmv: number;
    commission?: number;
    conversions: number;
    impressions: number;
    clicks: number;
    cvr: number;
    validation_rate: number;
    roi: number;
    profit: number;
  };
  history?: Array<{
    period_start: string;
    gmv: number;
    conversions: number;
    impressions: number;
    clicks: number;
    profit: number;
    cvr: number;
    ctr: number;
    roi: number;
    validation_rate: number;
    commission?: number;
  }>;
  weekly_trend?: Array<{
    week: string;
    date: string;
    gmv: number;
    commission: number;
    conversions: number;
    impressions: number;
    clicks: number;
    profit: number;
    cvr: number;
  }>;
  last_updated: string;
}

export interface MonthlyMetricRow {
  report_month: string;
  retailer_name: string;
  network: string;
  gmv: number;
  commission_validated: number;
  profit: number;
  impressions: number;
  google_clicks: number;
  network_clicks: number;
  google_conversions_transaction: number;
  network_conversions_transaction: number;
  conversion_rate: number;
  validation_rate: number;
  roi: number;
  fetch_datetime: string;
}

export type {
  PageHeadlineData,
  MetricCardData,
  ContextualInfoData,
  InsightsPanelData,
  PageInsightsResponse,
} from './page-insights'

export interface CategoryData {
  category: string;
  category_level1: string | null;
  category_level2: string | null;
  category_level3: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cvr: number | null;
  percentage: number;
  health_status?: 'broken' | 'underperforming' | 'attention' | 'healthy' | 'star' | null;
  health_reason?: string;
}

export interface ProductsOverview {
  total_products: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cvr: number;
  top_1_pct_products: number;
  top_1_pct_conversions_share: number;
  top_5_pct_products: number;
  top_5_pct_conversions_share: number;
  top_10_pct_products: number;
  top_10_pct_conversions_share: number;
  star_products: number;
  strong_products: number;
  moderate_products: number;
  underperforming_products: number;
  critical_products: number;
  top_products: Array<{
    product_title: string;
    impressions: number;
    clicks: number;
    ctr: number;
    conversions: number;
    cvr: number;
    tier: 'star' | 'good';
  }>;
  products_driving_50_pct: number;
  products_driving_80_pct: number;
  products_with_wasted_clicks: number;
  total_wasted_clicks: number;
  wasted_clicks_percentage: number;
  active_products?: number;
  zero_visibility?: number;
  needs_attention?: number;
  top_by_cvr?: Array<{ cvr: number }>;
}

export interface AuctionInsightsResponse {
  overview: {
    avg_impression_share: number;
    total_competitors: number;
    avg_overlap_rate: number;
    avg_outranking_share: number;
    avg_being_outranked: number;
  };
  top_competitor: {
    name: string;
    overlap_rate: number;
    outranking_you?: number;
    you_outranking?: number;
  } | null;
  biggest_threat: {
    name: string;
    overlap_rate: number;
    outranking_you?: number;
    you_outranking?: number;
  } | null;
  best_opportunity: {
    name: string;
    overlap_rate: number;
    outranking_you?: number;
    you_outranking?: number;
  } | null;
  date_range: {
    start: string;
    end: string;
    days: number;
  };
  source: string;
}

export interface RetailerListItem {
  retailer_id: string;
  retailer_name: string;
  status: string;
  category: string;
  tier: string;
  account_manager: string;
  gmv: number;
  conversions: number;
  validation_rate: number;
  alert_count: number;
}

export interface RetailerDetails {
  retailer_id: string;
  retailer_name: string;
  status?: string;
  category?: string;
  tier?: string;
  account_manager?: string;
  logo_url?: string;
  gmv?: number;
  conversions?: number;
  validation_rate?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cvr?: number;
  roi?: number;
  config?: RetailerConfigResponse;
}

// ============================================================================
// Database Types
// ============================================================================

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  command: string;
}

export type TransactionCallback<T> = (client: unknown) => Promise<T>;

// ============================================================================
// Performance Metrics Types (for future phases)
// ============================================================================

export interface KeywordPerformance {
  search_term: string;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  ctr: number;
  conversion_rate: number;
  days_active: number;
  performance_tier: 'star' | 'strong' | 'underperforming' | 'poor';
}

export interface CategoryPerformance {
  retailerId: string;
  categoryName: string;
  insightDate: Date;
  impressions: number;
  clicks: number;
  conversions: number;
  gmv: number;
  ctr: number;
  cvr: number;
  roi: number;
}

export interface ProductPerformance {
  retailerId: string;
  itemId: string;
  productTitle: string;
  insightDate: Date;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cvr: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
