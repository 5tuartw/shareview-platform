# Snapshot Generator Service

## Overview

The Snapshot Generator is responsible for aggregating raw performance data from the source database (acc_mgmt) into pre-computed snapshots in shareview-db. This is a **data aggregation** service only - analysis and classification happen separately.

## Two-Phase Architecture

### Phase 1: Aggregation (This Service)
- Reads raw data from source (keywords, categories, products, auctions)
- Aggregates by date range (monthly, weekly, custom)
- Stores pre-computed metrics in snapshot tables
- **Does NOT** classify or analyze data (no tiers, no health status)

### Phase 2: Analysis (Separate Service - To Be Built)
- Reads snapshot data
- Applies business logic (tier classification, health status)
- Generates insights and recommendations
- Updates JSONB fields with classified data

## How It Works

### 1. Change Detection
The generator checks for updated source data:
- Queries source database for latest `fetch_datetime` per retailer/month
- Compares against `last_updated` timestamp in snapshot tables
- Only processes months where source data is newer than snapshot

### 2. Month Identification
Since source typically updates the last 60 days:
- Identifies complete calendar months with new data
- Skips incomplete months (current month unless it's the last day)
- Processes whole months only (YYYY-MM-01 to YYYY-MM-last_day)

### 3. Aggregation Logic
For each enabled retailer and complete month:
- **Keywords**: SUM impressions/clicks/conversions, AVG ctr/cvr, COUNT distinct keywords
- **Categories**: SUM metrics by category hierarchy (level1-5)
- **Products**: SUM metrics by item_id, calculate concentration (top 1%, 5%, 10%)
- **Auctions**: AVG impression_share, overlap_rate by competitor
- **Coverage**: COUNT active vs zero-visibility products

### 4. Upsert Pattern
Uses idempotent upserts via unique constraint:
```sql
INSERT INTO keywords_snapshots (retailer_id, range_type, range_start, range_end, ...)
VALUES (...)
ON CONFLICT (retailer_id, range_type, range_start, range_end)
DO UPDATE SET ...
```

## Configuration

Snapshots are enabled per-retailer via `retailer_metadata`:
- `snapshot_enabled`: Boolean toggle (currently: boots, qvc = true)
- `snapshot_default_ranges`: Array of range types (currently: ['month'])
- `snapshot_detail_level`: 'summary' | 'detail' | 'full'
- `snapshot_retention_days`: Auto-cleanup policy (currently: 180 days)

## Running the Generator

### Manual Execution
```bash
# Generate snapshots for all enabled retailers
npm run snapshots:generate

# Generate for specific retailer
npm run snapshots:generate -- --retailer=boots

# Generate for specific month
npm run snapshots:generate -- --month=2026-01

# Dry run (show what would be generated)
npm run snapshots:generate -- --dry-run
```

### Scheduled Execution
```bash
# Daily at 3am (after source data updates)
# Configured in Cloud Scheduler or cron
0 3 * * * npm run snapshots:generate
```

## Database Connections

The service requires connections to:
- **Source DB** (acc_mgmt): Read-only, supports two modes
  - **Tunnel mode** (default): Via SSH tunnel to localhost:18007
  - **Direct mode**: Direct connection to 10.2.0.2:8007
- **ShareView DB**: Read-write, via Cloud SQL Proxy on localhost:5437

### Connection Mode Selection

Set `SOURCE_DB_MODE` in `.env.local`:

```bash
# Tunnel mode (local development - default)
SOURCE_DB_MODE=tunnel
SOURCE_DB_TUNNEL_HOST=127.0.0.1
SOURCE_DB_TUNNEL_PORT=18007

# Direct mode (production/remote)
# SOURCE_DB_MODE=direct
# SOURCE_DB_DIRECT_HOST=10.2.0.2
# SOURCE_DB_DIRECT_PORT=8007
```

See `docs/SOURCE_DB_CONNECTION_MODES.md` for detailed configuration.

Environment variables:
```
# Connection mode
SOURCE_DB_MODE=tunnel  # or 'direct'

# Tunnel mode
SOURCE_DB_TUNNEL_HOST=127.0.0.1
SOURCE_DB_TUNNEL_PORT=18007

# Direct mode
SOURCE_DB_DIRECT_HOST=10.2.0.2
SOURCE_DB_DIRECT_PORT=8007

# Shared credentials
SOURCE_DB_USER=postgres
SOURCE_DB_PASS=...
SOURCE_DB_NAME=acc_mgmt

# ShareView DB (via Cloud SQL Proxy)
SV_DBUSER=sv_user
SV_DBPASSWORD=ShareView2026!
SV_DBNAME=shareview
```

## Output

The generator produces:
- Log output showing processed months and row counts
- Updated snapshot tables with aggregated metrics
- Timestamps in `last_updated` field for change tracking

**What it does NOT produce:**
- Tier classifications (star/strong/underperforming)
- Health status (broken/healthy/attention)
- Insights or recommendations
- Alert triggers

These are handled by the separate Analysis service.

## Example Flow

```
1. Source updates (daily):
   keywords.fetch_datetime = 2026-02-16 03:00:00
   (includes data for 2025-12-11 to 2026-02-15)

2. Generator runs (3am):
   - Checks enabled retailers: boots, qvc
   - Identifies complete months: Dec 2025, Jan 2026
   - Queries source for each month's data
   - Aggregates and upserts snapshots

3. Keywords snapshot created:
   retailer_id: 'boots'
   range_type: 'month'
   range_start: 2026-01-01
   range_end: 2026-01-31
   total_keywords: 12,543
   total_impressions: 1,234,567
   last_updated: 2026-02-16 03:05:23

4. Analysis service (separate, later):
   - Reads snapshot
   - Calculates tiers based on CVR
   - Updates top_keywords JSONB with classified data
```

## Next Steps

1. Implement TypeScript service (`generate-snapshots.ts`)
2. Add change detection queries
3. Implement month identification logic
4. Build aggregation queries for each domain
5. Add logging and error handling
6. Create npm scripts for execution
7. (Later) Build Analysis service for classification
