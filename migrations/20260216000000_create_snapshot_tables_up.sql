-- Migration Version: 20260216000000
-- Description: Create snapshot tables for ShareView Platform analytics data with flexible date ranges
-- Dependencies: retailer_metadata table must exist

BEGIN;

-- ============================================================================
-- Table 1: keywords_snapshots
-- Aggregated keyword performance metrics for arbitrary date ranges
-- ============================================================================
CREATE TABLE keywords_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    classified_at TIMESTAMP,
    
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
    top_keywords JSONB,
    bottom_keywords JSONB,
    
    CONSTRAINT uq_keywords_snapshot_range UNIQUE (retailer_id, range_type, range_start, range_end),
    CONSTRAINT chk_keywords_date_range CHECK (range_end >= range_start)
);

-- Keywords snapshots indexes
CREATE INDEX idx_keywords_snapshots_retailer ON keywords_snapshots(retailer_id);
CREATE INDEX idx_keywords_snapshots_range_type ON keywords_snapshots(range_type);
CREATE INDEX idx_keywords_snapshots_dates ON keywords_snapshots(range_start, range_end);
CREATE INDEX idx_keywords_snapshots_retailer_dates ON keywords_snapshots(retailer_id, range_start, range_end);

COMMENT ON TABLE keywords_snapshots IS 'Aggregated keyword performance snapshots for flexible date ranges';
COMMENT ON COLUMN keywords_snapshots.range_type IS 'Type of date range: month (calendar month), week (ISO week), custom (arbitrary admin-selected)';
COMMENT ON COLUMN keywords_snapshots.top_keywords IS 'JSONB array of top 10 keywords by conversions: [{search_term, impressions, clicks, conversions, ctr, cvr}, ...]';
COMMENT ON COLUMN keywords_snapshots.bottom_keywords IS 'JSONB array of bottom 10 keywords by conversions';

-- ============================================================================
-- Table 2: category_performance_snapshots
-- Aggregated category performance metrics with health status
-- ============================================================================
CREATE TABLE category_performance_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    classified_at TIMESTAMP,
    
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
    
    -- Category details (JSONB)
    categories JSONB,
    health_summary JSONB,
    
    CONSTRAINT uq_category_snapshot_range UNIQUE (retailer_id, range_type, range_start, range_end),
    CONSTRAINT chk_category_date_range CHECK (range_end >= range_start)
);

-- Category snapshots indexes
CREATE INDEX idx_category_snapshots_retailer ON category_performance_snapshots(retailer_id);
CREATE INDEX idx_category_snapshots_range_type ON category_performance_snapshots(range_type);
CREATE INDEX idx_category_snapshots_dates ON category_performance_snapshots(range_start, range_end);
CREATE INDEX idx_category_snapshots_retailer_dates ON category_performance_snapshots(retailer_id, range_start, range_end);

COMMENT ON TABLE category_performance_snapshots IS 'Aggregated category performance snapshots with health status classification';
COMMENT ON COLUMN category_performance_snapshots.categories IS 'JSONB array of all categories with full hierarchy and metrics';
COMMENT ON COLUMN category_performance_snapshots.health_summary IS 'JSONB summary grouped by health status: {broken: [{...}], underperforming: [{...}], ...}';

-- ============================================================================
-- Table 3: product_performance_snapshots
-- Aggregated product performance with concentration and waste metrics
-- ============================================================================
CREATE TABLE product_performance_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    classified_at TIMESTAMP,
    
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
    top_performers JSONB,
    underperformers JSONB,
    
    CONSTRAINT uq_product_snapshot_range UNIQUE (retailer_id, range_type, range_start, range_end),
    CONSTRAINT chk_product_date_range CHECK (range_end >= range_start)
);

-- Product snapshots indexes
CREATE INDEX idx_product_snapshots_retailer ON product_performance_snapshots(retailer_id);
CREATE INDEX idx_product_snapshots_range_type ON product_performance_snapshots(range_type);
CREATE INDEX idx_product_snapshots_dates ON product_performance_snapshots(range_start, range_end);
CREATE INDEX idx_product_snapshots_retailer_dates ON product_performance_snapshots(retailer_id, range_start, range_end);

COMMENT ON TABLE product_performance_snapshots IS 'Aggregated product performance snapshots with concentration analysis and wasted clicks';
COMMENT ON COLUMN product_performance_snapshots.top_performers IS 'JSONB array of top performers: [{item_id, product_title, impressions, clicks, conversions, ctr, cvr}, ...]';
COMMENT ON COLUMN product_performance_snapshots.underperformers IS 'JSONB array of underperforming products';

-- ============================================================================
-- Table 4: auction_insights_snapshots
-- Competitor analysis and auction performance metrics
-- ============================================================================
CREATE TABLE auction_insights_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    classified_at TIMESTAMP,
    
    -- Summary metrics
    avg_impression_share NUMERIC(5,2),
    total_competitors INT,
    avg_overlap_rate NUMERIC(5,2),
    avg_outranking_share NUMERIC(5,2),
    avg_being_outranked NUMERIC(5,2),
    
    -- Competitor details (JSONB)
    competitors JSONB,
    
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
    
    CONSTRAINT uq_auction_snapshot_range UNIQUE (retailer_id, range_type, range_start, range_end),
    CONSTRAINT chk_auction_date_range CHECK (range_end >= range_start)
);

-- Auction snapshots indexes
CREATE INDEX idx_auction_snapshots_retailer ON auction_insights_snapshots(retailer_id);
CREATE INDEX idx_auction_snapshots_range_type ON auction_insights_snapshots(range_type);
CREATE INDEX idx_auction_snapshots_dates ON auction_insights_snapshots(range_start, range_end);
CREATE INDEX idx_auction_snapshots_retailer_dates ON auction_insights_snapshots(retailer_id, range_start, range_end);

COMMENT ON TABLE auction_insights_snapshots IS 'Aggregated auction insights with competitor analysis';
COMMENT ON COLUMN auction_insights_snapshots.competitors IS 'JSONB array of all competitors: [{competitor_name, overlap_rate, outranking_share, impression_share}, ...]';

-- ============================================================================
-- Table 5: product_coverage_snapshots
-- Product visibility coverage and distribution metrics
-- ============================================================================
CREATE TABLE product_coverage_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    classified_at TIMESTAMP,
    
    -- Coverage metrics
    total_products INT,
    active_products INT,
    zero_visibility_products INT,
    coverage_pct NUMERIC(5,2),
    avg_impressions_active NUMERIC(10,2),
    
    -- Category insights (JSONB)
    top_category JSONB,
    biggest_gap JSONB,
    categories JSONB,
    distribution JSONB,
    
    CONSTRAINT uq_coverage_snapshot_range UNIQUE (retailer_id, range_type, range_start, range_end),
    CONSTRAINT chk_coverage_date_range CHECK (range_end >= range_start)
);

-- Coverage snapshots indexes
CREATE INDEX idx_coverage_snapshots_retailer ON product_coverage_snapshots(retailer_id);
CREATE INDEX idx_coverage_snapshots_range_type ON product_coverage_snapshots(range_type);
CREATE INDEX idx_coverage_snapshots_dates ON product_coverage_snapshots(range_start, range_end);
CREATE INDEX idx_coverage_snapshots_retailer_dates ON product_coverage_snapshots(retailer_id, range_start, range_end);

COMMENT ON TABLE product_coverage_snapshots IS 'Product visibility coverage analysis and distribution';
COMMENT ON COLUMN product_coverage_snapshots.top_category IS 'JSONB of category with highest coverage: {name, product_count, coverage_pct}';
COMMENT ON COLUMN product_coverage_snapshots.biggest_gap IS 'JSONB of category with most zero-visibility products: {name, product_count, zero_visibility_count}';
COMMENT ON COLUMN product_coverage_snapshots.categories IS 'JSONB array of all categories with coverage metrics';
COMMENT ON COLUMN product_coverage_snapshots.distribution IS 'JSONB histogram: {ranges: [{min, max, count}, ...]}';

-- ============================================================================
-- Table 6: insight_runs
-- AI-generated insights linked to snapshots
-- ============================================================================
CREATE TABLE insight_runs (
    id SERIAL PRIMARY KEY,
    snapshot_id INT NOT NULL,
    snapshot_table VARCHAR(50) NOT NULL CHECK (snapshot_table IN (
        'keywords_snapshots',
        'category_performance_snapshots',
        'product_performance_snapshots',
        'auction_insights_snapshots',
        'product_coverage_snapshots'
    )),
    model_name VARCHAR(100),
    model_version VARCHAR(50),
    prompt_hash VARCHAR(64),
    summary TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- Insight runs indexes
CREATE INDEX idx_insight_runs_snapshot ON insight_runs(snapshot_table, snapshot_id);
CREATE INDEX idx_insight_runs_created ON insight_runs(created_at DESC);

COMMENT ON TABLE insight_runs IS 'AI-generated insights for performance snapshots';
COMMENT ON COLUMN insight_runs.snapshot_table IS 'Name of snapshot table this insight references';
COMMENT ON COLUMN insight_runs.prompt_hash IS 'SHA256 hash of prompt template and parameters for reproducibility';
COMMENT ON COLUMN insight_runs.created_by IS 'User who triggered insight generation (NULL if automated)';

-- ============================================================================
-- Table 7: insight_evidence
-- Evidence data points referenced by AI insights
-- ============================================================================
CREATE TABLE insight_evidence (
    id SERIAL PRIMARY KEY,
    insight_run_id INT NOT NULL REFERENCES insight_runs(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    rank INT,
    payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insight evidence indexes
CREATE INDEX idx_insight_evidence_run_metric ON insight_evidence(insight_run_id, metric_name);
CREATE INDEX idx_insight_evidence_rank ON insight_evidence(insight_run_id, rank);

COMMENT ON TABLE insight_evidence IS 'Evidence data points (top-N items) referenced by AI insights';
COMMENT ON COLUMN insight_evidence.metric_name IS 'Type of evidence: top_keyword, underperforming_product, etc.';
COMMENT ON COLUMN insight_evidence.rank IS 'Position in top-N/bottom-N list (1 = highest)';
COMMENT ON COLUMN insight_evidence.payload IS 'Full data point as JSON (product details, keyword metrics, etc.)';

-- ============================================================================
-- Retailer Snapshot Configuration
-- Add snapshot control fields to retailer_metadata
-- ============================================================================
ALTER TABLE retailer_metadata 
    ADD COLUMN IF NOT EXISTS snapshot_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS snapshot_default_ranges TEXT[] DEFAULT ARRAY['month'],
    ADD COLUMN IF NOT EXISTS snapshot_detail_level VARCHAR(20) DEFAULT 'summary' 
        CHECK (snapshot_detail_level IN ('summary', 'detail', 'full')),
    ADD COLUMN IF NOT EXISTS snapshot_retention_days INT DEFAULT 90;

COMMENT ON COLUMN retailer_metadata.snapshot_enabled IS 'Enable/disable snapshot generation for this retailer';
COMMENT ON COLUMN retailer_metadata.snapshot_default_ranges IS 'Default snapshot range types to generate: [month, week, custom]';
COMMENT ON COLUMN retailer_metadata.snapshot_detail_level IS 'Level of detail in snapshots: summary (metrics only), detail (+ top/bottom), full (all products)';
COMMENT ON COLUMN retailer_metadata.snapshot_retention_days IS 'Number of days to retain snapshots before cleanup';

COMMIT;
