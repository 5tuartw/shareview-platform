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

// ============================================================================
// Database Types
// ============================================================================

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
}

export type TransactionCallback<T> = (client: any) => Promise<T>;

// ============================================================================
// Performance Metrics Types (for future phases)
// ============================================================================

export interface KeywordPerformance {
  retailerId: string;
  keyword: string;
  insightDate: Date;
  impressions: number;
  clicks: number;
  conversions: number;
  gmv: number;
  ctr: number;
  cvr: number;
  roi: number;
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

export interface ApiResponse<T = any> {
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

// ============================================================================
// API Request/Response Types for Routes
// ============================================================================

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  full_name: string;
  role: UserRole | string;
  retailerIds?: string[];
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
  access_level: 'VIEWER' | 'ADMIN';
}

export interface UserResponse {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  retailerAccess: RetailerAccess[];
}

export interface RetailerListItem {
  retailer_id: string;
  retailer_name: string;
  category: string | null;
  tier: string | null;
  status: string | null;
  account_manager: string | null;
  high_priority: boolean;
  gmv: number | null;
  conversions: number | null;
  validation_rate: number | null;
}

export interface RetailerDetails extends RetailerListItem {
  onboarding_date: string | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cvr: number | null;
  roi: number | null;
  config: RetailerConfigResponse;
}

export interface RetailerConfigRequest {
  visible_tabs: string[];
  visible_metrics: string[];
  keyword_filters: string[];
  features_enabled: {
    insights?: boolean;
    competitor_comparison?: boolean;
    market_insights?: boolean;
    [key: string]: any;
  };
}

export interface RetailerConfigResponse extends RetailerConfigRequest {
  retailer_id: string;
  updated_by: number | null;
  updated_at: string;
}

export interface ApiError {
  error: string;
  details?: any;
}
