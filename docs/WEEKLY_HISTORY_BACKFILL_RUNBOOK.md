# Weekly History Backfill Runbook

## Purpose
This runbook identifies retailers whose weekly history appears truncated in overview queries because only 13-week-tagged rows are available, while additional historical periods exist as non-week-tagged rows.

It avoids synthetic re-tagging of monthly rows. Instead, it supports proper re-import/backfill with weekly semantics.

## 1. Run the audit
From `shareview-platform/`:

```bash
npx tsx scripts/audit_weekly_history_tagging.ts --output-dir /tmp/weekly-audit
```

Output files:
- `/tmp/weekly-audit/weekly_history_tagging_audit.json`
- `/tmp/weekly-audit/weekly_history_tagging_audit.csv`
- `/tmp/weekly-audit/weekly_history_tagging_suspected.csv`

`suspected_historical_untagged=true` currently means:
- `week_tagged_weeks = 13`
- `non_week_tagged_periods >= 12`

## 2. Validate one retailer manually
Use analytics DB:

```sql
SELECT
  rm.retailer_id,
  fr.fetch_type,
  CASE WHEN rm.report_period LIKE '%(Week)' THEN 'week_tagged' ELSE 'not_week_tagged' END AS tag_state,
  COUNT(DISTINCT rm.period_start_date) AS periods,
  MIN(rm.period_start_date) AS first_period,
  MAX(rm.period_start_date) AS last_period
FROM retailer_metrics rm
LEFT JOIN fetch_runs fr ON fr.id = rm.fetch_run_id
WHERE rm.retailer_id = '<SOURCE_RETAILER_ID>'
GROUP BY 1,2,3
ORDER BY 2,3;
```

Expected signature for affected retailers:
- 13-week-tagged periods from `13_weeks`
- Additional non-week-tagged periods from `12_months` or `current_month`

## 3. Backfill strategy
Use a real weekly import process for affected retailers and date windows.

Rules:
- Do not relabel monthly rows as week rows.
- Do not overwrite recent good weekly rows unless intentional.
- Backfill in small batches (for example 5-10 retailers per run).

Recommended batch process:
1. Select affected retailers from `weekly_history_tagging_suspected.csv`.
2. For each retailer, run weekly-history import covering missing months.
3. Recompute/refresh any dependent aggregates if required by pipeline.
4. Re-run the audit script and confirm retailer exits suspected list.

## 4. Post-backfill verification
For each processed retailer, verify:

```sql
SELECT
  COUNT(DISTINCT CASE WHEN report_period LIKE '%(Week)' THEN period_start_date END) AS week_tagged_weeks,
  MIN(CASE WHEN report_period LIKE '%(Week)' THEN period_start_date END) AS first_week,
  MAX(CASE WHEN report_period LIKE '%(Week)' THEN period_start_date END) AS last_week
FROM retailer_metrics
WHERE retailer_id = '<SOURCE_RETAILER_ID>';
```

Success criteria:
- Week-tagged count is greater than 13 where full-year weekly data is expected.
- Overview API returns expected historical weekly range.

## 5. Rollout safeguards
- Keep per-batch logs with retailer IDs and date windows.
- Pause batch execution if any retailer shows anomalous duplicate or inconsistent week boundaries.
- Keep a rollback plan by recording `fetch_run_id` values introduced by each batch.
