# Search Terms Snapshot Validation Checklist

Use this checklist once the search terms source database is reachable again.

## Scope

Validate recent changes to keyword snapshot generation:
- Increased positive quadrant caps:
  - Winners: 150
  - Hidden Gems: 150
- Added low-volume fallback qualification:
  - Default: impressions >= 50 and clicks >= 5
  - Fallback trigger: qualified_count < 30 OR positive_count < 20
  - Fallback thresholds: impressions >= 30 and clicks >= 3

## Prerequisites

1. Cloud SQL proxy for ShareView DB is running.
2. Source keywords DB tunnel/connection is available.
3. Environment variables from `.env.local` are loaded (handled by script runtime).
4. Work from repository root.

## Target Retailers

- High presence: `6771` (Uniqlo)
- Low presence: `1101l6495` (Fenwick)

## Step 1: Confirm Source Freshness

```bash
npm run audit:source-updates -- --output-dir=/tmp/shareview-audit
```

Expected:
- Command succeeds.
- Output files exist under `/tmp/shareview-audit`.
- Retailers `6771` and `1101l6495` appear with recent `keywords` updates.

## Step 2: Dry-Run Snapshots (No Writes)

```bash
npm run snapshots:dry-run -- --retailer=6771 --month=2026-02
npm run snapshots:dry-run -- --retailer=1101l6495 --month=2026-02
```

Capture from console output for each retailer:
- Qualified Keywords
- Positive Keywords (with conversions)
- Median CTR Threshold
- Winners Count
- Hidden Gems Count
- Whether low-volume fallback mode appears in qualification section

Repeat for at least one additional month (for example `2026-01`) to avoid one-month anomalies.

## Step 3: Generate Snapshots (Writes)

Only after dry-run output looks correct:

```bash
npm run snapshots:generate -- --retailer=6771 --month=2026-02
npm run snapshots:generate -- --retailer=1101l6495 --month=2026-02
```

## Step 4: Verify Persisted Snapshot JSON

Run in SQL client against ShareView DB:

```sql
SELECT
  retailer_id,
  range_start,
  jsonb_array_length(top_keywords->'winners') AS winners_count,
  jsonb_array_length(top_keywords->'hidden_gems') AS hidden_gems_count,
  top_keywords->>'median_ctr' AS median_ctr,
  top_keywords->'qualification'->>'min_impressions' AS min_impressions,
  top_keywords->'qualification'->>'min_clicks' AS min_clicks,
  top_keywords->'qualification'->>'fallback_applied' AS fallback_applied,
  top_keywords->'qualification'->>'fallback_reason' AS fallback_reason,
  top_keywords->'qualification'->>'trigger_qualified_count' AS trigger_qualified_count,
  top_keywords->'qualification'->>'trigger_positive_count' AS trigger_positive_count,
  top_keywords->'qualification'->>'positive_count' AS positive_count
FROM keywords_snapshots
WHERE retailer_id IN ('6771', '1101l6495')
  AND range_type = 'month'
  AND range_start IN ('2026-02-01', '2026-01-01')
ORDER BY retailer_id, range_start;
```

Expected:
- Winners and Hidden Gems reflect new caps where enough data exists.
- Fenwick may show `fallback_applied = true` in sparse months.
- Qualification fields match runtime thresholds used for that month.

## Step 5: API/UI Spot Check

1. Call API endpoint for each retailer and month:
   - `/api/retailers/{id}/keywords?period=YYYY-MM`
2. Confirm quadrant counts align with DB snapshot JSON.
3. In UI search terms performance page, confirm positive quadrants show expanded results where available.

## Quick Troubleshooting

- `Connection terminated unexpectedly` during snapshot scripts:
  - Usually source DB tunnel is unavailable or stale.
- API returns old counts after generation:
  - Confirm `range_start` month and retailer IDs; regenerate with explicit `--month`.
- No fallback observed for low-volume retailer:
  - Check if baseline qualified_count is >= 30 and positive_count is >= 20; fallback only applies when either trigger is below threshold.
