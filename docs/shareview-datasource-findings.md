# ShareView Data Source Findings (acc_mgmt)

## Scope
This document captures the current schema and coverage for the new ShareView data source (acc_mgmt), plus a comparison against the rsr-db performance tables.

## Connection Notes
- Accessed via SSH tunnel to host 188.245.104.170, forwarding to 10.2.0.2:8007.
- Local port used in tooling: 18007 (avoids conflicts with cur8or tunnels).

## Data Coverage Snapshot (2026-02-16)
Source tables:
- product_performance: 589,708 rows, 2 retailers, date range 2025-12-11 to 2026-02-16
- category_performance: 18,955 rows, 2 retailers, date range 2025-12-11 to 2026-02-16
- keywords: 1,329,826 rows, 2 retailers, date range 2025-12-11 to 2026-02-16

Account coverage:
- accounts: 67 rows, 67 distinct customer_id values
- keywords: 2 distinct customer_id values (matches retailer_id count)

## Schema Summary (Source)
accounts
- id (int, pk), customer_id, account_name, currency_code, time_zone, account_status, manager (bool)
- created_at, updated_at

account_campaigns
- id (int, pk), account_name, customer_id, campaign, campaign_id, campaign_state
- created_at, updated_at

category_performance
- id (int, pk), retailer_id, campaign_name, insight_date
- category_level1-5 (all required)
- impressions, clicks (int), conversions (numeric)
- ctr, cvr (numeric)
- fetch_datetime, created_at, updated_at

keywords
- id (int, pk), retailer_id, customer_id, campaign_name, insight_date
- search_term (varchar 500)
- impressions, clicks (int), conversions (numeric)
- ctr, cvr (numeric)
- fetch_datetime, created_at, updated_at

product_performance
- id (int, pk), retailer_id, campaign_id, campaign_name, insight_date
- item_id, product_title, product_title_normalized
- impressions, clicks (int), conversions (numeric)
- ctr, cvr (numeric)
- fetch_datetime, created_at, updated_at

## Indexes (Source Performance Tables)
category_performance
- unique: (retailer_id, campaign_name, insight_date, category_level1-5)
- indexes: retailer_id, insight_date, retailer_id + insight_date, category_level1

keywords
- unique: (retailer_id, campaign_name, insight_date, search_term)
- indexes: retailer_id, insight_date, retailer_id + insight_date, search_term

product_performance
- unique: (retailer_id, campaign_name, insight_date, item_id)
- indexes: retailer_id, insight_date, retailer_id + insight_date, item_id

## Differences vs rsr-db Performance Tables
- conversions: numeric(10,2) in source vs integer in rsr-db
- ctr/cvr precision: numeric(10,2) in source vs numeric(5,2) in rsr-db
- category levels: level1-5 are required in source; nullable in rsr-db
- keywords: no search_term_normalized or raw_data in source
- product_performance: includes campaign_id in source (not in rsr-db)

## rsr-db Snapshot Table Fit
Existing snapshot tables in rsr-db:
- auction_insights_snapshots
- category_performance_snapshots
- product_coverage_snapshots
- product_performance_snapshots

Fit assessment:
- category_performance_snapshots includes data_start_date/data_end_date, which supports flexible ranges.
- product_performance_snapshots uses period (string) and lacks range_start/range_end.
- auction_insights_snapshots and product_coverage_snapshots rely on date_range (integer) and snapshot_date only.
- There is no keywords snapshot table.

Conclusion: rsr-db snapshot schemas are not fully flexible for arbitrary admin-selected ranges. A new shareview-db snapshot model should include range_type, range_start, and range_end for each domain.

## Notes for Snapshot Strategy
- Source appears to update daily (date range ends 2026-02-16).
- Only 2 retailers currently populate performance tables; accounts table suggests more customers exist.
- Consider a daily snapshot job that pulls only the delta for each insight_date and writes to snapshot tables rather than storing raw detail permanently.

## Suggested Insight Storage Integration
To support AI analysis without storing all raw detail indefinitely:
- insight_runs: one row per generated insight (snapshot_id, model/version, prompt hash, summary, created_at)
- insight_evidence: evidence rows keyed to insight_runs (metric_name, rank, payload JSON)

This allows keeping only the data actually referenced by insights (top-N products/keywords/categories) while serving snapshots as the source of truth.

## Proposed shareview-db Snapshot Schema

### Core Snapshot Tables (one per domain)

**keywords_snapshots**
```sql
CREATE TABLE keywords_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL, -- 'month', 'week', 'custom'
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Summary metrics
    total_keywords INT,
    total_impressions BIGINT,
    total_clicks BIGINT,
    total_conversions NUMERIC(10,2),
    overall_ctr NUMERIC(10,4),
    overall_cvr NUMERIC(10,4),
    
    -- Tier distribution
    tier_star_count INT,
    tier_strong_count INT,
    tier_underperforming_count INT,
    tier_poor_count INT,
    
    -- Top/bottom performers (JSONB arrays)
    top_keywords JSONB, -- [{search_term, impressions, clicks, conversions, ctr, cvr}, ...]
    bottom_keywords JSONB,
    
    UNIQUE (retailer_id, range_type, range_start, range_end)
);
```

**category_performance_snapshots**
```sql
CREATE TABLE category_performance_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL,
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Summary metrics
    total_categories INT,
    total_impressions BIGINT,
    total_clicks BIGINT,
    total_conversions NUMERIC(10,2),
    overall_ctr NUMERIC(10,4),
    overall_cvr NUMERIC(10,4),
    
    -- Health distribution
    health_broken_count INT,
    health_underperforming_count INT,
    health_attention_count INT,
    health_healthy_count INT,
    health_star_count INT,
    
    -- Category details (JSONB array)
    categories JSONB, -- [{level1, level2, level3, level4, level5, impressions, clicks, conversions, ctr, cvr, health_status}, ...]
    health_summary JSONB, -- {broken: [{...}], underperforming: [{...}], ...}
    
    UNIQUE (retailer_id, range_type, range_start, range_end)
);
```

**product_performance_snapshots**
```sql
CREATE TABLE product_performance_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL,
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Summary metrics
    total_products INT,
    total_conversions NUMERIC(10,2),
    avg_ctr NUMERIC(10,2),
    avg_cvr NUMERIC(10,2),
    
    -- Performance tiers
    star_count INT,
    good_count INT,
    underperformer_count INT,
    
    -- Concentration metrics
    top_1_pct_products INT,
    top_1_pct_conversions_share NUMERIC(5,2),
    top_5_pct_products INT,
    top_5_pct_conversions_share NUMERIC(5,2),
    top_10_pct_products INT,
    top_10_pct_conversions_share NUMERIC(5,2),
    
    -- Wasted clicks
    products_with_wasted_clicks INT,
    total_wasted_clicks INT,
    wasted_clicks_percentage NUMERIC(5,2),
    
    -- Top/bottom performers (JSONB)
    top_performers JSONB, -- [{item_id, product_title, impressions, clicks, conversions, ctr, cvr}, ...]
    underperformers JSONB,
    
    UNIQUE (retailer_id, range_type, range_start, range_end)
);
```

**auction_insights_snapshots**
```sql
CREATE TABLE auction_insights_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL,
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Summary metrics
    avg_impression_share NUMERIC(5,2),
    total_competitors INT,
    avg_overlap_rate NUMERIC(5,2),
    avg_outranking_share NUMERIC(5,2),
    avg_being_outranked NUMERIC(5,2),
    
    -- Competitor details (JSONB)
    competitors JSONB, -- [{competitor_name, overlap_rate, outranking_share, impression_share}, ...]
    
    -- Top insights
    top_competitor_id VARCHAR(255),
    top_competitor_overlap_rate NUMERIC(5,2),
    top_competitor_outranking_you NUMERIC(5,2),
    biggest_threat_id VARCHAR(255),
    biggest_threat_overlap_rate NUMERIC(5,2),
    biggest_threat_outranking_you NUMERIC(5,2),
    best_opportunity_id VARCHAR(255),
    best_opportunity_overlap_rate NUMERIC(5,2),
    best_opportunity_you_outranking NUMERIC(5,2),
    
    UNIQUE (retailer_id, range_type, range_start, range_end)
);
```

**product_coverage_snapshots**
```sql
CREATE TABLE product_coverage_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL,
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Coverage metrics
    total_products INT,
    active_products INT,
    zero_visibility_products INT,
    coverage_pct NUMERIC(5,2),
    avg_impressions_active NUMERIC(10,2),
    
    -- Category insights (JSONB)
    top_category JSONB, -- {name, product_count, coverage_pct}
    biggest_gap JSONB, -- {name, product_count, zero_visibility_count}
    categories JSONB, -- [{name, product_count, active, zero_visibility, coverage_pct}, ...]
    distribution JSONB, -- {ranges: [{min, max, count}, ...]}
    
    UNIQUE (retailer_id, range_type, range_start, range_end)
);
```

### Insight Storage Tables

**insight_runs**
```sql
CREATE TABLE insight_runs (
    id SERIAL PRIMARY KEY,
    snapshot_id INT NOT NULL,
    snapshot_table VARCHAR(50) NOT NULL, -- 'keywords_snapshots', 'product_performance_snapshots', etc.
    model_name VARCHAR(100),
    model_version VARCHAR(50),
    prompt_hash VARCHAR(64), -- SHA256 of prompt template + params
    summary TEXT, -- Generated insight summary
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by INT -- references users.id if manually triggered
);
```

**insight_evidence**
```sql
CREATE TABLE insight_evidence (
    id SERIAL PRIMARY KEY,
    insight_run_id INT NOT NULL REFERENCES insight_runs(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL, -- 'top_keyword', 'underperforming_product', etc.
    rank INT, -- Position in top-N list
    payload JSONB NOT NULL, -- The actual data point referenced
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insight_evidence_run_metric ON insight_evidence(insight_run_id, metric_name);
```

### Retailer Snapshot Configuration

Add to existing **retailer_metadata** table:
```sql
ALTER TABLE retailer_metadata ADD COLUMN snapshot_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE retailer_metadata ADD COLUMN snapshot_default_ranges TEXT[];
ALTER TABLE retailer_metadata ADD COLUMN snapshot_detail_level VARCHAR(20); -- 'summary', 'detail', 'full'
ALTER TABLE retailer_metadata ADD COLUMN snapshot_retention_days INT DEFAULT 90;
```

### Indexes

For each snapshot table:
```sql
-- Example for keywords_snapshots
CREATE INDEX idx_keywords_snapshots_retailer ON keywords_snapshots(retailer_id);
CREATE INDEX idx_keywords_snapshots_range_type ON keywords_snapshots(range_type);
CREATE INDEX idx_keywords_snapshots_dates ON keywords_snapshots(range_start, range_end);
CREATE INDEX idx_keywords_snapshots_retailer_dates ON keywords_snapshots(retailer_id, range_start, range_end);
```

### Snapshot Job Workflow

1. **Daily Scheduler**: Runs at configured time (e.g., 2am)
2. **Read Retailer Config**: Query `retailer_metadata` for `snapshot_enabled = true`
3. **Compute Date Ranges**: 
   - Month: Calendar month boundaries (e.g., 2026-02-01 to 2026-02-28)
   - Week: ISO week boundaries (Monday to Sunday)
   - Custom: Admin-specified ranges from UI
4. **Aggregate Source Data**: Query acc_mgmt tables by retailer_id, date range
5. **Calculate Metrics**: Compute summary stats, tiers, top/bottom performers
6. **Upsert Snapshots**: `INSERT ... ON CONFLICT (retailer_id, range_type, range_start, range_end) DO UPDATE`
7. **Trigger Insights** (optional): Generate AI insights for new/updated snapshots
8. **Store Evidence**: Save only referenced data points in `insight_evidence`

### Sample Upsert Logic

```sql
-- Example for keywords_snapshots
INSERT INTO keywords_snapshots (
    retailer_id, range_type, range_start, range_end,
    total_keywords, total_impressions, total_clicks, total_conversions,
    overall_ctr, overall_cvr,
    tier_star_count, tier_strong_count, tier_underperforming_count, tier_poor_count,
    top_keywords, bottom_keywords
)
SELECT 
    retailer_id,
    'month',
    DATE_TRUNC('month', insight_date),
    (DATE_TRUNC('month', insight_date) + INTERVAL '1 month - 1 day')::DATE,
    COUNT(DISTINCT search_term),
    SUM(impressions),
    SUM(clicks),
    SUM(conversions),
    AVG(ctr),
    AVG(cvr),
    COUNT(*) FILTER (WHERE cvr >= 5.0),
    COUNT(*) FILTER (WHERE cvr >= 2.0 AND cvr < 5.0),
    COUNT(*) FILTER (WHERE cvr >= 0.5 AND cvr < 2.0),
    COUNT(*) FILTER (WHERE cvr < 0.5),
    (SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT search_term, impressions, clicks, conversions, ctr, cvr
        FROM keywords_source
        WHERE retailer_id = k.retailer_id
        ORDER BY conversions DESC
        LIMIT 10
    ) t),
    (SELECT jsonb_agg(row_to_json(b)) FROM (
        SELECT search_term, impressions, clicks, conversions, ctr, cvr
        FROM keywords_source
        WHERE retailer_id = k.retailer_id
        ORDER BY conversions ASC
        LIMIT 10
    ) b)
FROM keywords_source k
WHERE retailer_id = $1
  AND insight_date BETWEEN $2 AND $3
GROUP BY retailer_id
ON CONFLICT (retailer_id, range_type, range_start, range_end)
DO UPDATE SET
    total_keywords = EXCLUDED.total_keywords,
    total_impressions = EXCLUDED.total_impressions,
    total_clicks = EXCLUDED.total_clicks,
    total_conversions = EXCLUDED.total_conversions,
    overall_ctr = EXCLUDED.overall_ctr,
    overall_cvr = EXCLUDED.overall_cvr,
    tier_star_count = EXCLUDED.tier_star_count,
    tier_strong_count = EXCLUDED.tier_strong_count,
    tier_underperforming_count = EXCLUDED.tier_underperforming_count,
    tier_poor_count = EXCLUDED.tier_poor_count,
    top_keywords = EXCLUDED.top_keywords,
    bottom_keywords = EXCLUDED.bottom_keywords,
    last_updated = NOW();
```

## Data Window and Update Behaviour
- Current coverage spans 68 days (2025-12-11 to 2026-02-16) across product_performance, category_performance, and keywords.
- Rows within the most recent 60 days (relative to max insight_date):
	- product_performance: 561,093 of 589,708
	- category_performance: 16,527 of 18,955
	- keywords: 1,299,763 of 1,329,826
- No duplicate key groups detected on source natural keys:
	- keywords: (retailer_id, campaign_name, insight_date, search_term)
	- category_performance: (retailer_id, campaign_name, insight_date, category_level1-5)
	- product_performance: (retailer_id, campaign_name, insight_date, item_id)
- This indicates the source is likely upserting/overwriting by key rather than appending duplicates for the same day.
