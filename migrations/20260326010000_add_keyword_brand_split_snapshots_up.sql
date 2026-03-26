-- Migration: 20260326010000_add_keyword_brand_split_snapshots_up

BEGIN;

CREATE TABLE keyword_brand_split_snapshots (
  id SERIAL PRIMARY KEY,
  retailer_id VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  source_analysis_date DATE,
  brand_scope VARCHAR(40) NOT NULL CHECK (
    brand_scope IN ('retailer', 'retailer_and_owned', 'retailer_owned_and_stocked')
  ),
  total_search_terms INT NOT NULL DEFAULT 0,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_clicks BIGINT NOT NULL DEFAULT 0,
  total_conversions NUMERIC(10,2) NOT NULL DEFAULT 0,
  matched_vocab_count INT NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_data_start DATE,
  actual_data_end DATE,

  CONSTRAINT uq_keyword_brand_split_snapshot UNIQUE (
    retailer_id,
    range_type,
    range_start,
    range_end,
    brand_scope
  ),
  CONSTRAINT chk_keyword_brand_split_snapshot_dates CHECK (range_end >= range_start)
);

CREATE TABLE keyword_brand_split_term_snapshots (
  id SERIAL PRIMARY KEY,
  retailer_id VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  range_type VARCHAR(20) NOT NULL CHECK (range_type IN ('month', 'week', 'custom')),
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  source_analysis_date DATE,
  brand_scope VARCHAR(40) NOT NULL CHECK (
    brand_scope IN ('retailer', 'retailer_and_owned', 'retailer_owned_and_stocked')
  ),
  search_term TEXT NOT NULL,
  normalized_search_term TEXT NOT NULL,
  classification VARCHAR(30) NOT NULL CHECK (
    classification IN ('generic', 'brand_and_term', 'brand_only')
  ),
  matched_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_brand_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_clicks BIGINT NOT NULL DEFAULT 0,
  total_conversions NUMERIC(10,2) NOT NULL DEFAULT 0,
  ctr NUMERIC(10,4),
  cvr NUMERIC(10,4),
  share_of_total_conversions_pct NUMERIC(10,4),

  CONSTRAINT uq_keyword_brand_split_term_snapshot UNIQUE (
    retailer_id,
    range_type,
    range_start,
    range_end,
    brand_scope,
    normalized_search_term
  ),
  CONSTRAINT chk_keyword_brand_split_term_dates CHECK (range_end >= range_start)
);

CREATE INDEX idx_keyword_brand_split_snapshots_retailer_period
  ON keyword_brand_split_snapshots(retailer_id, range_start, range_end, brand_scope);

CREATE INDEX idx_keyword_brand_split_snapshots_scope
  ON keyword_brand_split_snapshots(brand_scope, range_start DESC);

CREATE INDEX idx_keyword_brand_split_term_snapshots_scope_classification
  ON keyword_brand_split_term_snapshots(retailer_id, brand_scope, classification, range_start DESC);

CREATE INDEX idx_keyword_brand_split_term_snapshots_conversions
  ON keyword_brand_split_term_snapshots(retailer_id, range_start, total_conversions DESC);

COMMENT ON TABLE keyword_brand_split_snapshots IS
  'Frozen search-term brand split summaries by retailer, period, and matching scope for Brand Splits reporting.';

COMMENT ON COLUMN keyword_brand_split_snapshots.brand_scope IS
  'Matching scope used for classification: retailer only, retailer plus owned labels, or retailer plus all linked stocked brands.';

COMMENT ON COLUMN keyword_brand_split_snapshots.summary IS
  'JSONB object keyed by generic, brand_and_term, and brand_only with counts, volumes, and conversion share percentages.';

COMMENT ON TABLE keyword_brand_split_term_snapshots IS
  'Frozen per-search-term brand split classification output used to power Brand Splits drill-down tables.';

COMMENT ON COLUMN keyword_brand_split_term_snapshots.matched_aliases IS
  'Normalized vocabulary phrases that matched the search term for the selected scope.';

COMMENT ON COLUMN keyword_brand_split_term_snapshots.matched_brand_labels IS
  'Distinct human-readable retailer or brand labels matched for the search term.';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260326010000', 'Create keyword brand split snapshot tables for search-term brand classification', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;