// Route protection middleware
// Protects routes based on authentication status and user roles

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/api/auth'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // If accessing public route, allow
  if (isPublicRoute) {
    // If already logged in and accessing /login, redirect to appropriate dashboard
    if (pathname === '/login' && session?.user) {
      const role = session.user.role;
      if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } else if (role === 'CLIENT_VIEWER' || role === 'CLIENT_ADMIN') {
        const retailerId = session.user.currentRetailerId || session.user.retailerIds?.[0];
        if (retailerId) {
          return NextResponse.redirect(new URL(`/retailer/${retailerId}`, request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // If no session and accessing protected route, redirect to login
  if (!session?.user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = session.user.role;

  // Role-based route protection
  // SALES_TEAM and CSS_ADMIN routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/client')) {
    if (role !== 'SALES_TEAM' && role !== 'CSS_ADMIN') {
      // CLIENT roles trying to access sales team areas - redirect to their retailer
      const retailerId = session.user.currentRetailerId || session.user.retailerIds?.[0];
      if (retailerId) {
        return NextResponse.redirect(new URL(`/retailer/${retailerId}`, request.url));
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // CLIENT routes
  if (pathname.startsWith('/retailer/')) {
    const pathParts = pathname.split('/');
    const retailerId = pathParts[2];

    // SALES_TEAM accessing retailer route - allow (they can view any retailer)
    if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
      return NextResponse.next();
    }

    // CLIENT roles must have access to this specific retailer
    if (role === 'CLIENT_VIEWER' || role === 'CLIENT_ADMIN') {
      const hasAccess = session.user.retailerIds?.includes(retailerId);
      if (!hasAccess) {
        // No access to this retailer - redirect to their first retailer
        const firstRetailerId = session.user.retailerIds?.[0];
        if (firstRetailerId) {
          return NextResponse.redirect(new URL(`/retailer/${firstRetailerId}`, request.url));
        }
        return NextResponse.redirect(new URL('/login', request.url));
      }
    }
  }

  // API route protection
  // User management and config APIs require SALES_TEAM role
  if (pathname.startsWith('/api/users') || pathname.startsWith('/api/config')) {
    if (role !== 'SALES_TEAM' && role !== 'CSS_ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      );
    }
  }

  // Retailer API routes
  if (pathname.startsWith('/api/retailers/') || pathname.startsWith('/api/analytics/')) {
    const pathParts = pathname.split('/');
    const retailerId = pathParts[3]; // /api/retailers/[id]/...

    if (retailerId) {
      // Check retailer access
      if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
        // Sales team has access to all retailers
        return NextResponse.next();
      }

      // CLIENT roles must have access to this retailer
      if (role === 'CLIENT_VIEWER' || role === 'CLIENT_ADMIN') {
        const hasAccess = session.user.retailerIds?.includes(retailerId);
        if (!hasAccess) {
          return NextResponse.json(
            { error: 'Unauthorized: No access to this retailer' },
            { status: 403 }
          );
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img).*)'],
};
