# ShareView Platform Database Migrations

This directory contains SQL migrations for the ShareView Platform RBAC (Role-Based Access Control) system.

## Purpose

The RBAC schema provides:
- **User Authentication**: Secure login with bcrypt password hashing
- **Role-Based Authorization**: Four user roles (CLIENT_VIEWER, CLIENT_ADMIN, SALES_TEAM, CSS_ADMIN)
- **Granular Access Control**: Per-retailer access assignments with VIEWER/ADMIN levels
- **UI Customization**: Per-retailer configuration for visible tabs, metrics, and features
- **Audit Trail**: Comprehensive activity logging for compliance and debugging

## Prerequisites

- PostgreSQL 12+ with JSONB support
- Existing `retailer_metadata` table (from s8-retailer-analytics)
- `psql` command-line tool
- Database connection with CREATE/DROP privileges

## Migration Files

### Schema Migrations
1. **20260202000000_create_rbac_tables_up.sql**
   - Creates: `users`, `user_retailer_access`, `retailer_config`, `activity_log` tables
   - Adds: 15 indexes (B-tree and GIN for JSONB/array queries)
   - Includes: Foreign key constraints, CHECK constraints, unique constraints

2. **20260202000000_create_rbac_tables_down.sql**
   - Rollback: Drops all RBAC tables in correct dependency order

### Seed Data Migrations
3. **20260202000001_seed_initial_user_up.sql**
   - Creates initial SALES_TEAM admin user
   - Email: `admin@shareview.com`
   - Password: `ShareView2026!` (bcrypt hashed)

4. **20260202000001_seed_initial_user_down.sql**
   - Rollback: Removes initial admin user

## Running Migrations

### Method 1: Using Migration Script (Recommended)

Make the script executable:
```bash
chmod +x migrations/run-migration.sh
```

Run migrations:
```bash
# Set database connection
export DATABASE_URL='postgresql://user:password@host:5432/dbname'

# Apply schema migration
./migrations/run-migration.sh --up 20260202000000

# Apply seed data
./migrations/run-migration.sh --up 20260202000001

# Rollback if needed
./migrations/run-migration.sh --down 20260202000001
./migrations/run-migration.sh --down 20260202000000
```

### Method 2: Manual Execution with psql

```bash
# Schema migration
psql $DATABASE_URL -f migrations/20260202000000_create_rbac_tables_up.sql

# Seed data
psql $DATABASE_URL -f migrations/20260202000001_seed_initial_user_up.sql

# Rollback (reverse order)
psql $DATABASE_URL -f migrations/20260202000001_seed_initial_user_down.sql
psql $DATABASE_URL -f migrations/20260202000000_create_rbac_tables_down.sql
```

### Method 3: Using Node.js Database Library

See `lib/db.ts` for programmatic migration execution:
```typescript
import { runMigration } from './lib/db';

await runMigration('migrations/20260202000000_create_rbac_tables_up.sql');
await runMigration('migrations/20260202000001_seed_initial_user_up.sql');
```

## Migration Order

**IMPORTANT**: Migrations must be applied in order:

1. ✅ `20260202000000` - Create RBAC tables
2. ✅ `20260202000001` - Seed initial admin user

Rollback in **reverse order**:

1. ❌ `20260202000001` - Remove admin user
2. ❌ `20260202000000` - Drop RBAC tables

## Default Credentials

After running seed migration, use these credentials to login:

- **Email**: `admin@shareview.com`
- **Username**: `admin`
- **Password**: `ShareView2026!`
- **Role**: `SALES_TEAM` (full multi-retailer access)

### Security Warning

⚠️ **CRITICAL**: Change the default password immediately in production environments!

```sql
-- Change password after first login
UPDATE users 
SET password_hash = '$2b$10$NEW_BCRYPT_HASH_HERE',
    updated_at = NOW()
WHERE email = 'admin@shareview.com';
```

Generate new bcrypt hash in Node.js:
```javascript
const bcrypt = require('bcrypt');
const newHash = await bcrypt.hash('YourNewSecurePassword', 10);
```

## Verifying Migration Success

Run the verification script to check schema:
```bash
psql $DATABASE_URL -f migrations/verify-schema.sql
```

Expected output:
- ✓ 4 tables created (users, user_retailer_access, retailer_config, activity_log)
- ✓ 15 indexes created
- ✓ 1 admin user with SALES_TEAM role

## Rollback Instructions

If you need to rollback migrations:

```bash
# Rollback seed data first
./migrations/run-migration.sh --down 20260202000001

# Then rollback schema
./migrations/run-migration.sh --down 20260202000000
```

**Warning**: Rollback will **permanently delete** all user data, access grants, and activity logs. Ensure you have backups if needed.

## Environment Configuration

Add these variables to your `.env` file:

```env
# Database Connection
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Migration Configuration
MIGRATION_AUTO_RUN=false  # Set to true to auto-run on startup

# Initial Admin Credentials (Development Only)
INITIAL_ADMIN_EMAIL=admin@shareview.com
INITIAL_ADMIN_PASSWORD=ShareView2026!  # Change in production
```

## Troubleshooting

### Error: "relation retailer_metadata does not exist"

The RBAC tables reference `retailer_metadata` via foreign keys. Ensure this table exists first:

```sql
SELECT COUNT(*) FROM retailer_metadata;
```

If missing, run migrations from s8-retailer-analytics repository first.

### Error: "permission denied for table users"

Ensure your database user has sufficient privileges:

```sql
GRANT ALL PRIVILEGES ON DATABASE your_database TO your_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Error: "duplicate key value violates unique constraint"

If re-running seed migration, delete existing admin user first:

```sql
DELETE FROM users WHERE email = 'admin@shareview.com';
```

## Schema Overview

```
users
├── id (PK)
├── email (UNIQUE)
├── password_hash
├── role (CLIENT_VIEWER|CLIENT_ADMIN|SALES_TEAM|CSS_ADMIN)
└── is_active

user_retailer_access
├── id (PK)
├── user_id (FK → users)
├── retailer_id (FK → retailer_metadata)
├── access_level (VIEWER|ADMIN)
└── granted_by (FK → users)

retailer_config
├── retailer_id (PK, FK → retailer_metadata)
├── visible_tabs (TEXT[])
├── visible_metrics (TEXT[])
├── features_enabled (JSONB)
└── updated_by (FK → users)

activity_log
├── id (PK)
├── user_id (FK → users)
├── retailer_id (FK → retailer_metadata)
├── action
├── details (JSONB)
└── created_at
```

## Performance Notes

- All foreign keys are indexed for fast joins
- GIN indexes on JSONB/array columns enable efficient containment queries
- Composite index on `(user_id, created_at DESC)` optimizes user activity timelines
- BIGSERIAL on `activity_log.id` supports millions of audit records

## Next Steps

After running migrations:

1. ✅ Verify schema with `verify-schema.sql`
2. ✅ Test login with default admin credentials
3. ✅ Change default password in production
4. ✅ Create additional users via API or SQL
5. ✅ Configure retailer access assignments
6. ✅ Customise retailer configs per client needs

## Support

For issues or questions:
- Review migration logs in PostgreSQL
- Check `schema_migrations` table for applied versions
- Consult s8-retailer-analytics documentation for retailer_metadata schema
