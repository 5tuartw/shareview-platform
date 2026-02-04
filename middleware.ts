// Route protection middleware
// Simplified for Edge Runtime compatibility (bcrypt can't run in Edge)
// Full auth checks happen in page components using auth()

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicPaths = ['/login', '/api/auth'];
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  // For all other routes, auth checks will happen in the page/API route
  // This avoids bcrypt dependency in Edge Runtime middleware
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img).*)'],
};
