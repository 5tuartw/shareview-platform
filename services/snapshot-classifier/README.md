# Snapshot Classifier Service

## Purpose
The Snapshot Classifier bridges snapshot aggregation (T1a) and domain metrics generation (T1b). It reads raw performance rows from the source database, applies tier, health, and waste rules, then updates snapshot tables so downstream metrics can use classified data.

## Classification Rules

### Keywords (tiers)
- Uses `classifyPerformance` from `lib/performanceTiers.ts`.
- Counts are written to `keywords_snapshots`:
  - `tier_star_count`
  - `tier_strong_count`
  - `tier_underperforming_count` (moderate + underperforming)
  - `tier_poor_count` (critical)

### Categories (health)
- ROI < 0: broken
- ROI = 0: attention
- ROI > 0 and ROI < 200: healthy
- ROI >= 200: star

Health summaries are stored in `category_performance_snapshots.health_summary` as grouped arrays.

### Products (concentration and waste)
- Tiers use `classifyPerformance`:
  - star
  - good (strong + moderate)
  - underperformer (underperforming + critical)
- Concentration shares are computed for top 1%, 5%, and 10% products by conversions.
- Wasted clicks are products with CTR > 5% and CVR < 1%.

## Usage

```bash
# Classify everything that is missing tiers
npm run snapshots:classify

# Classify a specific retailer
npm run snapshots:classify -- --retailer=boots

# Classify a specific month
npm run snapshots:classify -- --month=2025-11

# Dry run (no updates)
npm run snapshots:classify -- --retailer=boots --month=2025-11 --dry-run
```

## Environment Variables
This service uses the same configuration as the snapshot generator:

- `SOURCE_DB_MODE` (tunnel or direct)
- `SOURCE_DB_TUNNEL_HOST`
- `SOURCE_DB_TUNNEL_PORT`
- `SOURCE_DB_DIRECT_HOST`
- `SOURCE_DB_DIRECT_PORT`
- `SOURCE_DB_USER`
- `SOURCE_DB_PASS`
- `SOURCE_DB_NAME`
- `SV_DB_HOST`
- `SV_DB_PORT`
- `SV_DB_USER` / `SV_DBUSER`
- `SV_DB_PASS` / `SV_DBPASSWORD`
- `SV_DB_NAME` / `SV_DBNAME`

## Scheduling
Runs daily at 4:30am, after snapshot aggregation and before domain metrics generation.

## Troubleshooting
- If counts are zero, confirm source data exists for the period in `acc_mgmt`.
- If updates do not appear, verify snapshot rows exist for the retailer and period.
- Use `--dry-run` to confirm classification logic without writing.
