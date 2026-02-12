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
