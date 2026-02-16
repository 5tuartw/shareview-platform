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

5. **20260202000002_create_dashboard_views_up.sql**
   - Creates: `dashboard_views` table with default views
   - Enables: Per-user custom dashboard view configurations

### Snapshot Data Migrations
6. **20260216000000_create_snapshot_tables_up.sql**
   - Creates: 5 snapshot tables (keywords, categories, products, auctions, coverage)
   - Creates: `insight_runs` and `insight_evidence` tables for AI insights
   - Extends: `retailer_metadata` with snapshot configuration columns
   - Adds: 24 indexes for efficient querying by retailer, date range, and type
   - Features: Flexible date ranges (month/week/custom), JSONB storage for nested data

7. **20260216000000_create_snapshot_tables_down.sql**
   - Rollback: Drops all snapshot and insight tables
   - Removes: Snapshot configuration columns from retailer_metadata

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
3. ✅ `20260202000002` - Create dashboard views
4. ⏳ `20260216000000` - Create snapshot tables

Rollback in **reverse order**:

1. ❌ `20260216000000` - Drop snapshot tables
2. ❌ `20260202000002` - Drop dashboard views
3. ❌ `20260202000001` - Remove admin user
4. ❌ `20260202000000` - Drop RBAC tables

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

dashboard_views
├── id (PK)
├── user_id (FK → users)
├── view_name
├── view_config (JSONB)
└── updated_at

keywords_snapshots
├── id (PK)
├── retailer_id
├── range_type (month|week|custom)
├── range_start, range_end
├── summary metrics (impressions, clicks, conversions, ctr, cvr)
├── tier distribution (star, strong, underperforming, poor)
└── top_keywords, bottom_keywords (JSONB)

category_performance_snapshots
├── id (PK)
├── retailer_id
├── range_type, range_start, range_end
├── summary metrics
├── health distribution (broken, underperforming, attention, healthy, star)
└── categories, health_summary (JSONB)

product_performance_snapshots
├── id (PK)
├── retailer_id
├── range_type, range_start, range_end
├── concentration metrics (top 1%, 5%, 10%)
├── wasted clicks metrics
└── top_performers, underperformers (JSONB)

auction_insights_snapshots
├── id (PK)
├── retailer_id
├── range_type, range_start, range_end
├── avg impression share, overlap, outranking metrics
└── competitors, top insights (JSONB)

product_coverage_snapshots
├── id (PK)
├── retailer_id
├── range_type, range_start, range_end
├── coverage metrics (total, active, zero visibility)
└── top_category, biggest_gap, categories, distribution (JSONB)

insight_runs
├── id (PK)
├── snapshot_id, snapshot_table
├── model_name, model_version, prompt_hash
├── summary (TEXT)
└── created_by (FK → users)

insight_evidence
├── id (PK)
├── insight_run_id (FK → insight_runs)
├── metric_name, rank
└── payload (JSONB)
```

## Performance Notes

- All foreign keys are indexed for fast joins
- GIN indexes on JSONB/array columns enable efficient containment queries
- Composite index on `(user_id, created_at DESC)` optimizes user activity timelines
- BIGSERIAL on `activity_log.id` supports millions of audit records
- Snapshot tables use UNIQUE constraints on `(retailer_id, range_type, range_start, range_end)` for idempotent upserts
- JSONB columns in snapshots enable flexible nested data without schema changes

## Snapshot Tables Overview

The snapshot tables provide pre-aggregated analytics data for flexible date ranges, enabling:

### Key Features
- **Flexible Date Ranges**: Support for monthly, weekly, and custom date ranges
- **Pre-Computed Metrics**: Summary statistics calculated during snapshot creation
- **Nested Data**: JSONB storage for top performers, category hierarchies, competitor details
- **Idempotent Updates**: Unique constraints enable safe re-computation of snapshots
- **Selective Retention**: Per-retailer snapshot_retention_days configuration

### Snapshot Types

1. **Keywords Snapshots**: Search term performance with tier classification
   - Tier thresholds: Star (CVR ≥ 5%), Strong (2-5%), Underperforming (0.5-2%), Poor (< 0.5%)
   - Top/bottom 10 keywords stored in JSONB arrays

2. **Category Performance Snapshots**: Category hierarchy performance with health status
   - Health levels: Broken, Underperforming, Attention, Healthy, Star
   - Full category tree with 5-level hierarchy support

3. **Product Performance Snapshots**: Product-level metrics with concentration analysis
   - Pareto analysis: Top 1%, 5%, 10% product contribution to conversions
   - Wasted clicks tracking: Products with clicks but no conversions

4. **Auction Insights Snapshots**: Competitor overlap and outranking metrics
   - Top competitor, biggest threat, best opportunity analysis
   - Full competitor list with overlap rates and impression share

5. **Product Coverage Snapshots**: Product visibility distribution
   - Active vs zero-visibility product counts
   - Category-level coverage gaps identification
   - Impression distribution histograms

### Snapshot Workflow

1. Daily job reads source data from acc_mgmt database
2. Aggregates metrics by retailer and date range
3. Computes derived statistics (tiers, health, concentration)
4. Upserts into snapshot tables (idempotent by unique constraint)
5. Optionally triggers AI insight generation
6. Stores only evidence data referenced by insights

### Retailer Configuration

Snapshot behavior is controlled per-retailer via `retailer_metadata` columns:

- `snapshot_enabled`: Enable/disable snapshot generation
- `snapshot_default_ranges`: Array of range types to generate (e.g., `['month', 'week']`)
- `snapshot_detail_level`: Controls verbosity (`'summary'`, `'detail'`, `'full'`)
- `snapshot_retention_days`: Auto-cleanup policy for old snapshots (default: 90 days)

### AI Insights Integration

The `insight_runs` and `insight_evidence` tables support AI-generated insights:

- **insight_runs**: Links to snapshots, stores model metadata and generated summary
- **insight_evidence**: Stores only the data points (top-N products, keywords, etc.) referenced by insights
- **Benefits**: Avoid storing full detail permanently; snapshots remain source of truth

Example flow:
1. Admin requests insight for "February 2026 keyword performance"
2. System generates insight from `keywords_snapshots` where `range_type='month'` and `range_start='2026-02-01'`
3. AI summary stored in `insight_runs` with model version and prompt hash
4. Top 5 underperforming keywords stored in `insight_evidence` for debugging
5. Full keyword list remains in snapshot JSONB, accessible if needed

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
