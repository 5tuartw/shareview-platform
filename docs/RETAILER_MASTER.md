# Retailer Master Registry

## Overview

The `retailer_master` table is ShareView's centralized registry of all retailers across all data sources. It provides a stable, deduplicated view of retailer metadata (ID, name, network) that can be reconciled from multiple sources.

**Status**: Currently syncs from RSR database only. Designed to support multiple sources in future.

## Schema

```sql
retailer_id          TEXT PRIMARY KEY     -- Unique retailer identifier
retailer_name        TEXT NOT NULL        -- Company name
network              TEXT                 -- Affiliate network (AW, Rakuten, etc.)
primary_source       TEXT                 -- Where this record originated
first_seen_date      TIMESTAMP            -- When first encountered in any data source
last_seen_date       TIMESTAMP            -- When last updated from source
last_sync_datetime   TIMESTAMP            -- Most recent sync timestamp
is_active            BOOLEAN              -- Soft-delete flag
metadata             JSONB                -- Extensible attributes for future use
created_at           TIMESTAMP            -- Record creation time
updated_at           TIMESTAMP            -- Last modification time
```

## Daily Sync Pattern

The sync script (`scripts/sync_rsr_retailers_to_master.py`) should run **daily after CSV imports complete**:

1. Query RSR `retailer_metrics` table for unique retailers
2. For each retailer:
   - **NEW**: Insert into `retailer_master` with `first_seen_date = NOW()`
   - **EXISTING**: Update `retailer_name`, `network`, `last_seen_date = NOW()` if changed
3. Only update if name or network differs (idempotent, avoids spammy `updated_at` changes)

### Running the Sync

```bash
# One-time setup
export RSR_DATABASE_URL='postgresql://analytics_user:AnalyticsUser2025!@127.0.0.1:5436/retailer_analytics'
export SV_DATABASE_URL='postgresql://sv_user:ShareView2026!@127.0.0.1:5437/shareview'
python scripts/sync_rsr_retailers_to_master.py
```

### Integrating with Cloud Run

To run daily after CSV download:
1. Add step to `gcp/deploy-csv-downloader.sh` or create new service
2. Or add trigger to CSV downloader service to call sync endpoint

## Multi-Source Support

The table is designed to accept retailers from multiple sources:

```python
# Example: Add retailers from a partner API
INSERT INTO retailer_master 
  (retailer_id, retailer_name, network, primary_source, first_seen_date, last_seen_date)
VALUES 
  ('partner_123', 'Acme Corp', 'Custom', 'partner_api', NOW(), NOW())
ON CONFLICT (retailer_id) DO UPDATE SET
  metadata = jsonb_set(metadata, '{sources}', '["rsr-csv", "partner_api"]'::jsonb)
```

## Future: Change History Tracking

**Currently NOT implemented** to keep initial rollout simple. When ready to implement:

### New Table: `retailer_master_history`

```sql
CREATE TABLE retailer_master_history (
  id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  retailer_id TEXT NOT NULL,
  change_type TEXT,           -- 'created', 'name_changed', 'network_changed', 'reactivated'
  previous_values JSONB,      -- What changed: {retailer_name: 'old', network: 'old'}
  new_values JSONB,           -- What it became: {retailer_name: 'new', network: 'new'}
  changed_at TIMESTAMP DEFAULT NOW(),
  changed_by TEXT,            -- sync job ID, user, API source, etc.
  FOREIGN KEY (retailer_id) REFERENCES retailer_master(retailer_id)
);
```

### Sync Script Enhancement

Track changes when syncing:

```python
# Pseudo-code for future implementation
if retailer_exists:
  if name_changed or network_changed:
    previous = {retailer_name, network}  # From current DB
    new = {retailer_name, network}       # From RSR
    INSERT INTO retailer_master_history 
      (retailer_id, change_type, previous_values, new_values, changed_by)
    VALUES (id, 'updated', previous, new, 'sync_job')
    UPDATE retailer_master SET ... (as before)
else:
  INSERT INTO retailer_master_history
    (retailer_id, change_type, new_values, changed_by)
  VALUES (id, 'created', {retailer_name, network}, 'sync_job')
  INSERT INTO retailer_master ...
```

### Rationale for Deferring

- Current priority: stable master registry
- History tracking adds complexity (indexes, queries)
- Can implement retroactively once core sync is stable
- History is nice-to-have for reconciliation, not critica for MVP

## Querying the Master Registry

```sql
-- All active retailers
SELECT * FROM retailer_master WHERE is_active;

-- Retailers by network
SELECT * FROM retailer_master WHERE network = 'AW';

-- Recently seen retailers (last 30 days)
SELECT * FROM retailer_master 
WHERE last_seen_date >= NOW() - INTERVAL '30 days';

-- Retailers that have dropped off data
SELECT * FROM retailer_master 
WHERE last_seen_date < NOW() - INTERVAL '60 days'
  AND is_active = true;
```

## Integration Points

**Replace RSR lookups** in queries and APIs:

```python
# OLD: Join to retailer_metrics for metadata
SELECT rm.retailer_id, rm.retailer_name, rm.network
FROM retailer_metrics rm
WHERE ...

# NEW: Join to retailer_master (stable schema)
SELECT master.retailer_id, master.retailer_name, master.network
FROM retailer_master master
WHERE master.is_active
```

**API Endpoint**: `GET /api/retailers/master` (list all for client hydration)

## Notes

- `metadata` JSONB is intentionally left empty for now—use for future extensibility (e.g., `{contact_email, region, subsidiary_of}`)
- `primary_source` defaults to `'rsr-csv'` but will support `'api'`, `'manual'`, etc. in future
- Soft-delete via `is_active` preserves history without querying dropped retailers by accident
