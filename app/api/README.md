# API Routes

This directory contains Next.js API routes for the platform.

## Planned Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/session` - Get current session

### Retailer Data
- `GET /api/retailer/[id]/overview` - Overview metrics
- `GET /api/retailer/[id]/keywords` - Keyword performance
- `GET /api/retailer/[id]/categories` - Category performance
- `GET /api/retailer/[id]/products` - Product performance
- `GET /api/retailer/[id]/coverage` - Product coverage
- `GET /api/retailer/[id]/auction` - Auction insights

### Sales Team
- `GET /api/sales/clients` - List all clients
- `GET /api/sales/clients/[id]` - Client details
- `PUT /api/sales/clients/[id]` - Update client config
- `GET /api/sales/performance` - Cross-client performance

### Admin
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/[id]` - Update user
- `DELETE /api/admin/users/[id]` - Delete user

## Implementation Pattern

All API routes follow this structure:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  // 1. Authentication check
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Authorization check
  // Verify user has permission for this resource

  // 3. Database query
  const result = await query('SELECT ...', [params]);

  // 4. Return response
  return NextResponse.json({ data: result.rows });
}
```

## Error Handling

- `401` - Unauthorized (not logged in)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `500` - Internal server error

## Future Implementation

See Phase 3 of the technical specification for detailed API implementation.
