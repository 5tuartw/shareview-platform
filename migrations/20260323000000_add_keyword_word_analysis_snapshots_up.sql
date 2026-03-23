-- Migration: 20260323000000_add_keyword_word_analysis_snapshots_up

BEGIN;

CREATE TABLE keyword_word_analysis_snapshots (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    source_analysis_date DATE,
    word VARCHAR(100) NOT NULL,
    keyword_count INT,
    total_occurrences INT,
    keywords_with_clicks INT,
    keywords_with_conversions INT,
    total_impressions BIGINT,
    total_clicks BIGINT,
    total_conversions NUMERIC(10,2),
    avg_ctr NUMERIC(10,4),
    avg_cvr NUMERIC(10,4),
    click_to_conversion_pct NUMERIC(10,4),
    word_category VARCHAR(50),
    performance_tier VARCHAR(20),

    CONSTRAINT uq_keyword_word_analysis_snapshot UNIQUE (retailer_id, range_type, range_start, range_end, word),
    CONSTRAINT chk_keyword_word_analysis_snapshot_dates CHECK (range_end >= range_start)
);

CREATE INDEX idx_keyword_word_analysis_snapshots_retailer_period
  ON keyword_word_analysis_snapshots(retailer_id, range_start, range_end);

CREATE INDEX idx_keyword_word_analysis_snapshots_tier
  ON keyword_word_analysis_snapshots(retailer_id, performance_tier);

CREATE INDEX idx_keyword_word_analysis_snapshots_word
  ON keyword_word_analysis_snapshots(retailer_id, word);

CREATE INDEX idx_keyword_word_analysis_snapshots_conversions
  ON keyword_word_analysis_snapshots(retailer_id, range_start, total_conversions DESC);

COMMENT ON TABLE keyword_word_analysis_snapshots IS 'Frozen word-level keyword analysis by retailer and date range for ShareView search terms pages and reports';
COMMENT ON COLUMN keyword_word_analysis_snapshots.source_analysis_date IS 'Latest source insight_date included when the word-analysis snapshot was generated';
COMMENT ON COLUMN keyword_word_analysis_snapshots.keyword_count IS 'Number of unique search terms containing the word within the date range';
COMMENT ON COLUMN keyword_word_analysis_snapshots.total_occurrences IS 'Total token occurrences across all search terms in the date range';
COMMENT ON COLUMN keyword_word_analysis_snapshots.click_to_conversion_pct IS 'Percentage of clicked keywords containing the word that also converted';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260323000000', 'Create keyword word analysis snapshot table for frozen search terms word analysis', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;