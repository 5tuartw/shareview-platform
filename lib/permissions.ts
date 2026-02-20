// RBAC permission helpers for ShareView Platform
// Provides reusable functions for role-based access control

import { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { query } from './db';
import { auth } from './auth';

export type UserRole = 'CLIENT_VIEWER' | 'CLIENT_ADMIN' | 'SALES_TEAM' | 'CSS_ADMIN';

/**
 * Check if user has one of the specified roles
 */
export function hasRole(session: Session | null, roles: UserRole | UserRole[]): boolean {
  if (!session?.user?.role) return false;
  
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.includes(session.user.role as UserRole);
}

/**
 * Check if user can access a specific retailer
 * SALES_TEAM and CSS_ADMIN can access all retailers
 * CLIENT roles can only access retailers in their retailerIds array
 */
export function canAccessRetailer(session: Session | null, retailerId: string): boolean {
  if (!session?.user) return false;
  
  const { role, retailerIds } = session.user;
  
  // SALES_TEAM and CSS_ADMIN have access to all retailers
  if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
    return true;
  }
  
  // CLIENT roles must have the retailer in their access list
  if (role === 'CLIENT_VIEWER' || role === 'CLIENT_ADMIN') {
    return retailerIds ? retailerIds.includes(retailerId) : false;
  }
  
  return false;
}

/**
 * Check if user can manage insights (approve/reject)
 * Only CSS_ADMIN and SALES_TEAM can manage insights
 */
export function canManageInsights(session: Session | null): boolean {
  return hasRole(session, ['CSS_ADMIN', 'SALES_TEAM']);
}

/**
 * Middleware factory: Require specific role(s) to access route
 * Returns 403 if user doesn't have required role
 */
export function requireRole(roles: UserRole | UserRole[]) {
  return async () => {
    const session = await auth();
    
    if (!hasRole(session, roles)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      );
    }
    
    return NextResponse.next();
  };
}

/**
 * Middleware factory: Require access to specific retailer
 * Returns 403 if user doesn't have access
 */
export function requireRetailerAccess(retailerId: string) {
  return async () => {
    const session = await auth();
    
    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      );
    }
    
    return NextResponse.next();
  };
}

/**
 * Get list of retailers accessible to current user
 * SALES_TEAM/CSS_ADMIN get all retailers
 * CLIENT roles get only their assigned retailers
 */
interface RetailerAccessSummary {
  retailer_id: string;
  retailer_name: string;
  gmv: number | null;
  conversions: number | null;
  validation_rate: number | null;
}

export async function filterRetailersByAccess(
  session: Session | null
): Promise<RetailerAccessSummary[]> {
  if (!session?.user) return [];
  
  const { role, retailerIds } = session.user;
  
  try {
    // SALES_TEAM and CSS_ADMIN see all retailers
    if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
      const result = await query(
        `SELECT retailer_id, retailer_name, gmv, conversions, validation_rate 
         FROM retailer_metadata 
         ORDER BY retailer_name`
      );
      return result.rows as RetailerAccessSummary[];
    }
    
    // CLIENT roles see only their assigned retailers
    if ((role === 'CLIENT_VIEWER' || role === 'CLIENT_ADMIN') && retailerIds && retailerIds.length > 0) {
      const result = await query(
        `SELECT retailer_id, retailer_name, gmv, conversions, validation_rate 
         FROM retailer_metadata 
         WHERE retailer_id = ANY($1)
         ORDER BY retailer_name`,
        [retailerIds]
      );
      return result.rows as RetailerAccessSummary[];
    }
    
    return [];
  } catch (error) {
    console.error('Error filtering retailers by access:', error);
    return [];
  }
}

/**
 * Get visible tabs for a retailer based on user role and config
 * SALES_TEAM sees all tabs unless in "View as Client" mode
 * CLIENT roles see only configured visible_tabs
 */
export async function getVisibleTabs(session: Session | null, retailerId: string): Promise<string[]> {
  if (!session?.user) return [];
  
  const { role } = session.user;
  const defaultTabs = ['overview', 'keywords', 'categories', 'products', 'auctions'];
  
  // SALES_TEAM and CSS_ADMIN see all tabs by default
  if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
    // TODO: Check for "View as Client" mode in future enhancement
    return defaultTabs;
  }
  
  // CLIENT roles see configured tabs
  try {
    const result = await query(
      `SELECT visible_tabs FROM retailer_config WHERE retailer_id = $1`,
      [retailerId]
    );
    
    if (result.rows.length > 0 && result.rows[0].visible_tabs) {
      return (result.rows[0].visible_tabs as string[]).filter((tab: string) => tab !== 'coverage');
    }
    
    // If no config exists, return all tabs
    return defaultTabs;
  } catch (error) {
    console.error('Error getting visible tabs:', error);
    return defaultTabs;
  }
}

/**
 * Get visible metrics for a retailer based on user role and config
 * SALES_TEAM sees all metrics unless in "View as Client" mode
 * CLIENT roles see only configured visible_metrics
 */
export async function getVisibleMetrics(session: Session | null, retailerId: string): Promise<string[]> {
  if (!session?.user) return [];
  
  const { role } = session.user;
  const defaultMetrics = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr'];
  
  // SALES_TEAM and CSS_ADMIN see all metrics by default
  if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
    return defaultMetrics;
  }
  
  // CLIENT roles see configured metrics
  try {
    const result = await query(
      `SELECT visible_metrics FROM retailer_config WHERE retailer_id = $1`,
      [retailerId]
    );
    
    if (result.rows.length > 0 && result.rows[0].visible_metrics) {
      return result.rows[0].visible_metrics;
    }
    
    // If no config exists, return all metrics
    return defaultMetrics;
  } catch (error) {
    console.error('Error getting visible metrics:', error);
    return defaultMetrics;
  }
}
