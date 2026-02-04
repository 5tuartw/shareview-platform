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
