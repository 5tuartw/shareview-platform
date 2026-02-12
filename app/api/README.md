# API Routes

This directory contains Next.js API routes for the platform.

## Analytics Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/session` - Get current session

### Retailer Analytics
- `GET /api/retailers/[id]/overview` - Overview metrics (13-week or 13-month)
  - Query params: `view_type` (weekly|monthly), `fetch_datetime` (optional)
- `GET /api/retailers/[id]/keywords` - Keyword performance
  - Query params: `metric`, `limit`, `period`, `tier`
- `GET /api/retailers/[id]/keywords/word-analysis` - Word-level analysis
  - Query params: `sort_by`, `tier`, `min_frequency`, `limit`
- `GET /api/retailers/[id]/categories` - Category performance
  - Query params: `date_range`, `level`
- `GET /api/retailers/[id]/categories/trends` - Category trends
- `GET /api/retailers/[id]/products/overview` - Products overview
  - Query params: `date_range`
- `GET /api/retailers/[id]/products/performance` - Product performance
  - Query params: `date_range`, `limit`
- `GET /api/retailers/[id]/auctions/overview` - Auction insights overview
  - Query params: `period`
- `GET /api/retailers/[id]/auctions/competitors` - Auction competitor breakdown
  - Query params: `period`, `sort_by`
- `GET /api/retailers/[id]/coverage` - Product coverage metrics
  - Query params: `date_range`

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

## Snapshot vs Live Data

Some endpoints use snapshot tables for fast response times. If a recent snapshot is not available,
the API falls back to live aggregation queries. The response includes `source` and `from_snapshot`
metadata where applicable.

## Testing Considerations

- Verify authentication and retailer access checks for every endpoint.
- Validate query parameter defaults and error responses for invalid values.
- Test snapshot fast paths and live fallback calculations.
- Confirm Decimal and Date serialisation to JSON-safe values.
- Exercise missing data cases and ensure structured error responses.
- Compare response formats against frontend expectations.
- Test multiple retailer IDs and role access levels.
- Run performance checks on larger datasets.
