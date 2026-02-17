-- Migration Version: 20260218000001
-- Description: Create keyword_performance table and materialized view for individual keyword analytics
-- Dependencies: retailer_metadata table must exist

BEGIN;

-- ============================================================================
-- Table: keyword_performance
-- Individual keyword performance data with date granularity
-- ============================================================================
CREATE TABLE IF NOT EXISTS keyword_performance (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    search_term TEXT NOT NULL,
    insight_date DATE NOT NULL,
    
    -- Performance metrics
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    conversions NUMERIC(10,2) NOT NULL DEFAULT 0,
    ctr NUMERIC(10,4),
    conversion_rate NUMERIC(10,4),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_keyword_performance UNIQUE (retailer_id, search_term, insight_date)
);

-- Create indexes for common queries
CREATE INDEX idx_keyword_performance_retailer ON keyword_performance(retailer_id);
CREATE INDEX idx_keyword_performance_date ON keyword_performance(insight_date);
CREATE INDEX idx_keyword_performance_retailer_date ON keyword_performance(retailer_id, insight_date);
CREATE INDEX idx_keyword_performance_conversions ON keyword_performance(retailer_id, conversions DESC) WHERE conversions > 0;

COMMENT ON TABLE keyword_performance IS 'Individual keyword performance metrics aggregated by day';
COMMENT ON COLUMN keyword_performance.search_term IS 'The search term/keyword';
COMMENT ON COLUMN keyword_performance.insight_date IS 'Date of the performance data';
COMMENT ON COLUMN keyword_performance.ctr IS 'Click-through rate (clicks/impressions * 100)';
COMMENT ON COLUMN keyword_performance.conversion_rate IS 'Conversion rate (conversions/clicks * 100)';

-- ============================================================================
-- Materialized View: mv_keywords_actionable
-- Aggregated keyword performance with performance tier classification
-- ============================================================================
CREATE MATERIALIZED VIEW mv_keywords_actionable AS
SELECT
    retailer_id,
    search_term,
    SUM(impressions) as total_impressions,
    SUM(clicks) as total_clicks,
    SUM(conversions) as total_conversions,
    ROUND((SUM(clicks)::NUMERIC / NULLIF(SUM(impressions), 0) * 100), 2) as ctr,
    ROUND((SUM(conversions)::NUMERIC / NULLIF(SUM(clicks), 0) * 100), 2) as conversion_rate,
    MIN(insight_date) as first_seen,
    MAX(insight_date) as last_seen,
    COUNT(DISTINCT insight_date) as days_active,
    
    -- Performance Tier Calculation
    CASE
        WHEN ROUND((SUM(conversions)::NUMERIC / NULLIF(SUM(clicks), 0) * 100), 2) >= 10 
         AND ROUND((SUM(clicks)::NUMERIC / NULLIF(SUM(impressions), 0) * 100), 2) >= 3
        THEN 'star'
        
        WHEN ROUND((SUM(conversions)::NUMERIC / NULLIF(SUM(clicks), 0) * 100), 2) >= 5
         OR (ROUND((SUM(clicks)::NUMERIC / NULLIF(SUM(impressions), 0) * 100), 2) >= 2
             AND ROUND((SUM(conversions)::NUMERIC / NULLIF(SUM(clicks), 0) * 100), 2) >= 3)
        THEN 'strong'
        
        WHEN ROUND((SUM(conversions)::NUMERIC / NULLIF(SUM(clicks), 0) * 100), 2) >= 2
         OR ROUND((SUM(clicks)::NUMERIC / NULLIF(SUM(impressions), 0) * 100), 2) >= 1.5
        THEN 'underperforming'
        
        ELSE 'poor'
    END as performance_tier

FROM keyword_performance
GROUP BY retailer_id, search_term
HAVING SUM(impressions) >= 10;

-- Create indexes on materialized view
CREATE INDEX idx_mv_keywords_retailer_conv ON mv_keywords_actionable(retailer_id, total_conversions DESC);
CREATE INDEX idx_mv_keywords_retailer_clicks ON mv_keywords_actionable(retailer_id, total_clicks DESC);
CREATE INDEX idx_mv_keywords_retailer_impr ON mv_keywords_actionable(retailer_id, total_impressions DESC);
CREATE INDEX idx_mv_keywords_tier ON mv_keywords_actionable(retailer_id, performance_tier);

COMMIT;
