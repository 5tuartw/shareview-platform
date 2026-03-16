# Search Terms Zero-CTR Tail Runbook

## Purpose

Repeatable method to inspect search-term zero-click tails and estimate a safe storage cut-off.

This runbook is designed for reruns as source data depth improves.

## Important Caveat

Do not make final storage policy decisions from very shallow data.

Minimum readiness recommendation:
- `keywords` updated days per retailer: median >= 14
- target retailers in scope: >= 14 updated days each
- preferred for policy lock-in: >= 30 updated days

## Prerequisites

1. Source DB tunnel is running and reachable.
2. Source env vars are configured (`SOURCE_DB_*`).
3. RSR Cloud SQL proxy is running if you want retailer name mapping from RSR.

## Step 1: Audit Source Freshness

```bash
npm run audit:source-updates -- --output-dir=/tmp
```

Outputs:
- `/tmp/source-update-audit-<timestamp>.json`
- `/tmp/source-update-audit-updated-days-<timestamp>.csv`

Quick check from CSV:
- Confirm `keywords` domain has acceptable updated-day depth.

## Step 2: Zero-Click Percentage by Retailer (Latest Fetch)

```bash
PGPASSWORD="$SOURCE_DB_PASS" psql "host=$SOURCE_DB_TUNNEL_HOST port=$SOURCE_DB_TUNNEL_PORT user=$SOURCE_DB_USER dbname=$SOURCE_DB_NAME" -P pager=off -c "\copy (
WITH latest_keywords AS (
  SELECT retailer_id, MAX(fetch_datetime) AS latest_fetch
  FROM keywords
  GROUP BY retailer_id
),
per_retailer AS (
  SELECT
    k.retailer_id,
    COUNT(*)::bigint AS keyword_rows_latest_fetch,
    SUM(CASE WHEN COALESCE(k.clicks,0)=0 THEN 1 ELSE 0 END)::bigint AS zero_click_rows_latest_fetch,
    ROUND(100.0 * SUM(CASE WHEN COALESCE(k.clicks,0)=0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS zero_click_pct_rows
  FROM keywords k
  JOIN latest_keywords lk
    ON k.retailer_id = lk.retailer_id
   AND k.fetch_datetime = lk.latest_fetch
  GROUP BY k.retailer_id
)
SELECT retailer_id, keyword_rows_latest_fetch, zero_click_rows_latest_fetch, zero_click_pct_rows
FROM per_retailer
ORDER BY zero_click_pct_rows DESC, keyword_rows_latest_fetch DESC, retailer_id
) TO '/tmp/keywords_zero_click_pct_latest_fetch.csv' WITH CSV HEADER"
```

## Step 3: Tail Cut-Off Analysis (70% Cumulative Impressions)

```bash
PGPASSWORD="$SOURCE_DB_PASS" psql "host=$SOURCE_DB_TUNNEL_HOST port=$SOURCE_DB_TUNNEL_PORT user=$SOURCE_DB_USER dbname=$SOURCE_DB_NAME" -P pager=off -c "\copy (
WITH latest AS (
  SELECT retailer_id, MAX(fetch_datetime) AS latest_fetch
  FROM keywords
  GROUP BY retailer_id
),
base AS (
  SELECT
    k.retailer_id,
    k.search_term,
    COALESCE(k.impressions,0)::bigint AS impressions,
    COALESCE(k.clicks,0)::bigint AS clicks
  FROM keywords k
  JOIN latest l
    ON k.retailer_id = l.retailer_id
   AND k.fetch_datetime = l.latest_fetch
),
ranked AS (
  SELECT
    retailer_id,
    search_term,
    impressions,
    clicks,
    SUM(impressions) OVER (PARTITION BY retailer_id) AS total_impressions,
    SUM(impressions) OVER (
      PARTITION BY retailer_id
      ORDER BY impressions DESC, clicks DESC, search_term
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cum_impressions
  FROM base
),
classified AS (
  SELECT
    retailer_id,
    search_term,
    impressions,
    clicks,
    CASE WHEN total_impressions > 0 THEN cum_impressions::numeric / total_impressions ELSE 0 END AS cum_impr_share,
    CASE
      WHEN clicks > 0 THEN 'keep_clicked'
      WHEN clicks = 0 AND (CASE WHEN total_impressions > 0 THEN cum_impressions::numeric / total_impressions ELSE 0 END) <= 0.70 THEN 'keep_zero_click'
      ELSE 'drop_zero_click'
    END AS bucket
  FROM ranked
),
eligible_retailers AS (
  SELECT
    retailer_id,
    COUNT(*) FILTER (WHERE bucket='keep_zero_click') AS keep_zero_count,
    COUNT(*) FILTER (WHERE bucket='drop_zero_click') AS drop_zero_count,
    COUNT(*) AS total_rows
  FROM classified
  GROUP BY retailer_id
  HAVING COUNT(*) FILTER (WHERE bucket='keep_zero_click') >= 3
     AND COUNT(*) FILTER (WHERE bucket='drop_zero_click') >= 3
  ORDER BY total_rows DESC
  LIMIT 10
),
keep_examples AS (
  SELECT
    c.retailer_id,
    c.search_term,
    c.impressions,
    ROW_NUMBER() OVER (PARTITION BY c.retailer_id ORDER BY c.impressions DESC, c.search_term) AS rn
  FROM classified c
  JOIN eligible_retailers e ON c.retailer_id = e.retailer_id
  WHERE c.bucket = 'keep_zero_click'
),
drop_examples AS (
  SELECT
    c.retailer_id,
    c.search_term,
    c.impressions,
    ROW_NUMBER() OVER (PARTITION BY c.retailer_id ORDER BY c.impressions DESC, c.search_term) AS rn
  FROM classified c
  JOIN eligible_retailers e ON c.retailer_id = e.retailer_id
  WHERE c.bucket = 'drop_zero_click'
)
SELECT
  e.retailer_id,
  e.total_rows,
  e.keep_zero_count,
  e.drop_zero_count,
  (SELECT string_agg(format('%s (%s imp)', k.search_term, k.impressions), ' | ')
     FROM keep_examples k
    WHERE k.retailer_id = e.retailer_id AND k.rn <= 3) AS kept_zero_click_examples,
  (SELECT string_agg(format('%s (%s imp)', d.search_term, d.impressions), ' | ')
     FROM drop_examples d
    WHERE d.retailer_id = e.retailer_id AND d.rn <= 3) AS dropped_zero_click_examples
FROM eligible_retailers e
ORDER BY e.total_rows DESC
) TO '/tmp/keywords_70pct_keep_drop_examples_10_retailers.csv' WITH CSV HEADER"
```

## Step 4: Optional Retailer Name Mapping (RSR)

Use RSR to map `retailer_id` to preferred display names.

If one retailer ID has multiple names, apply explicit override if needed (for example `5473 -> Damart/Ellis Brigham`).

## Step 5: Decision Guardrails

Use this order:
1. Confirm data depth readiness.
2. Compare zero-click percentage distribution.
3. Validate 70% tail examples on known retailers.
4. Dry-run any storage policy first.
5. Re-evaluate after broader lookback is loaded.

## Current Temporary Outputs

- `/tmp/source-update-audit-*.json`
- `/tmp/source-update-audit-updated-days-*.csv`
- `/tmp/keywords_zero_click_pct_latest_fetch.csv`
- `/tmp/keywords_70pct_keep_drop_examples_10_retailers.csv`
