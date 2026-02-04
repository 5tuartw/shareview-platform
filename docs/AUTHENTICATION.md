# ShareView Platform Authentication System

## Overview

The ShareView Platform implements a comprehensive RBAC (Role-Based Access Control) authentication system using NextAuth.js v5 with email/password credentials.

## User Roles

- **CLIENT_VIEWER**: Read-only access to assigned retailer(s)
- **CLIENT_ADMIN**: Full access to assigned retailer(s) including configuration
- **SALES_TEAM**: Access to all retailers with dashboard view
- **CSS_ADMIN**: Full platform administration access

## Authentication Flow

1. User enters email/username and password at `/login`
2. NextAuth.js validates credentials against `users` table
3. Password verified using bcrypt (cost factor 10)
4. Session created with JWT strategy (24-hour expiry)
5. User redirected based on role:
   - SALES_TEAM/CSS_ADMIN → `/dashboard`
   - CLIENT roles → `/retailer/[retailer-id]`

## Session Structure

```typescript
session.user = {
  id: string;              // User ID from database
  email: string;           // User email
  name: string;            // Full name
  role: UserRole;          // One of the four roles
  currentRetailerId?: string;  // Active retailer (CLIENT roles)
  retailerIds?: string[];      // Accessible retailers (CLIENT roles)
}
```

## Protected Routes

### Middleware Protection (`middleware.ts`)

- **Public**: `/login`, `/api/auth/*`
- **Sales Team Only**: `/dashboard`, `/client/*`, `/api/users/*`, `/api/config/*`
- **Client Access**: `/retailer/[id]` (must have access to specific retailer)
- **API Routes**: Role and retailer-specific protection

### Route Redirects

- Not authenticated → `/login`
- CLIENT accessing `/dashboard` → `/retailer/[their-retailer]`
- SALES_TEAM accessing `/retailer/*` → allowed (can view any retailer)

## RBAC Helper Functions

Located in `lib/permissions.ts`:

### `hasRole(session, role)`
Check if user has specific role(s)

### `canAccessRetailer(session, retailerId)`
Check if user can access a specific retailer

### `requireRole(roles)`
Middleware factory for API route protection

### `requireRetailerAccess(retailerId)`
Middleware factory for retailer-specific routes

### `filterRetailersByAccess(session)`
Get list of accessible retailers for current user

### `getVisibleTabs(session, retailerId)`
Get configured visible tabs for retailer

### `getVisibleMetrics(session, retailerId)`
Get configured visible metrics for retailer

## Activity Logging

All authentication events are logged to `activity_log` table:

- **login**: Successful login with user details
- **logout**: User logout
- **login_failed**: Failed login attempt (console only, no DB entry)

Usage:
```typescript
import { logActivity } from '@/lib/activity-logger';

await logActivity({
  userId: user.id,
  action: 'login',
  details: { email: user.email, role: user.role },
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
});
```

## Environment Variables

Required in `.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
NEXTAUTH_SECRET=your-secret-here-use-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
```

## Default Admin Credentials

After running migrations:

- **Email**: `admin@shareview.com`
- **Password**: `ShareView2026!`
- **Role**: SALES_TEAM

⚠️ **IMPORTANT**: Change default password immediately in production!

## Testing Authentication

### 1. Start Cloud SQL Proxy
```bash
./start_cloud_sql_proxy.sh
```

### 2. Run Migrations
```bash
DATABASE_URL='postgresql://analytics_user:AnalyticsUser2025!@127.0.0.1:5436/retailer_analytics' \
  ./migrations/run-migration.sh --up 20260202000000

DATABASE_URL='postgresql://analytics_user:AnalyticsUser2025!@127.0.0.1:5436/retailer_analytics' \
  ./migrations/run-migration.sh --up 20260202000001
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Test Login
1. Navigate to `http://localhost:3000/login`
2. Enter: `admin@shareview.com` / `ShareView2026!`
3. Should redirect to `/dashboard`

## API Usage Examples

### Protected API Route

```typescript
// app/api/users/route.ts
import { requireRole } from '@/lib/permissions';

export async function GET(request: Request) {
  // Only SALES_TEAM can access
  const authCheck = await requireRole(['SALES_TEAM', 'CSS_ADMIN'])(request);
  if (authCheck.status === 403) return authCheck;
  
  // Your API logic here
}
```

### Retailer-Specific API Route

```typescript
// app/api/retailers/[id]/route.ts
import { auth } from '@/lib/auth';
import { canAccessRetailer } from '@/lib/permissions';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  
  if (!canAccessRetailer(session, params.id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  // Your API logic here
}
```

### Client Component with Session

```typescript
'use client';

import { useSession } from 'next-auth/react';

export default function MyComponent() {
  const { data: session, status } = useSession();
  
  if (status === 'loading') return <div>Loading...</div>;
  if (!session) return <div>Not authenticated</div>;
  
  return (
    <div>
      <p>Welcome, {session.user.name}!</p>
      <p>Role: {session.user.role}</p>
    </div>
  );
}
```

## Security Features

1. **Password Hashing**: Bcrypt with cost factor 10
2. **CSRF Protection**: Automatic via NextAuth.js
3. **HTTP-Only Cookies**: Session stored in secure cookie
4. **JWT Signing**: NEXTAUTH_SECRET used to sign tokens
5. **Session Expiry**: 24-hour sliding window
6. **Activity Audit**: All logins tracked in database
7. **SQL Injection Protection**: Parameterized queries
8. **Route Protection**: Middleware checks authentication/authorization

## Troubleshooting

### "Invalid email or password"
- Check database connection (Cloud SQL proxy running?)
- Verify user exists: `SELECT * FROM users WHERE email = 'admin@shareview.com';`
- Confirm password hash in database matches seeded value

### Redirect loop at /login
- Check NEXTAUTH_URL matches your deployment URL
- Clear cookies and try again
- Check browser console for errors

### 403 on API routes
- Verify session exists: `GET /api/auth/session`
- Check user role matches required roles
- Ensure retailer access is configured

### Session not persisting
- Check NEXTAUTH_SECRET is set correctly
- Verify cookies are enabled in browser
- Check for console errors related to JWT

## Next Steps

1. **Create Dashboard Pages**: `/dashboard` for SALES_TEAM
2. **Create Retailer Pages**: `/retailer/[id]` for CLIENT access
3. **Build User Management**: CRUD for users (SALES_TEAM only)
4. **Add Config UI**: Manage retailer_config (SALES_TEAM only)
5. **Implement Client Switching**: Allow SALES_TEAM to switch retailer context
6. **Add Password Reset**: Email-based password recovery
7. **Implement Rate Limiting**: Prevent brute force attacks
8. **Add 2FA**: Optional two-factor authentication
