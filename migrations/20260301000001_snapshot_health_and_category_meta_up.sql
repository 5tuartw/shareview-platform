-- Migration: 20260301000001_snapshot_health_and_category_meta_up
-- Adds:
--   1. retailer_snapshot_health        — per-retailer, per-domain run health record
--   2. category_snapshot_periods       — benchmark metadata per retailer+period
--   3. category_performance_snapshots.in_benchmark   — per-node benchmark membership flag
--   4. retailers.domain_settings       — per-retailer domain customisation JSONB

BEGIN;

-- ============================================================
-- 1. Snapshot health tracking per retailer per domain
-- ============================================================
CREATE TABLE retailer_snapshot_health (
  retailer_id            VARCHAR(50)  NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  snapshot_type          VARCHAR(20)  NOT NULL
                           CHECK (snapshot_type IN ('keywords', 'categories', 'products', 'auctions')),
  status                 VARCHAR(20)  NOT NULL DEFAULT 'unknown'
                           CHECK (status IN ('ok', 'no_source_data', 'no_new_data', 'unknown')),
  last_attempted_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_successful_at     TIMESTAMPTZ,
  last_successful_period VARCHAR(7),   -- 'YYYY-MM' of the most recent period with real data
  record_count           INTEGER,      -- row count from the last successful run
  PRIMARY KEY (retailer_id, snapshot_type)
);

CREATE INDEX idx_retailer_snapshot_health_retailer
  ON retailer_snapshot_health (retailer_id);

COMMENT ON TABLE retailer_snapshot_health IS
  'Per-retailer, per-domain health record updated by the snapshot generator after each run. '
  'status values: ok = data written; no_source_data = retailer has no source_retailer_id or '
  'the source table returned no rows; no_new_data = source data is not newer than the existing snapshot.';

COMMENT ON COLUMN retailer_snapshot_health.last_successful_period IS
  'Most recent YYYY-MM month for which real data existed. Preserved across no_new_data runs '
  'so the UI can always show "last good snapshot was Feb 2026" even when nothing was regenerated.';

-- ============================================================
-- 2. Category benchmark metadata per retailer+period
-- ============================================================
CREATE TABLE category_snapshot_periods (
  retailer_id              VARCHAR(50)  NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  range_type               VARCHAR(20)  NOT NULL DEFAULT 'month',
  range_start              DATE         NOT NULL,
  range_end                DATE         NOT NULL,
  benchmark_strategy       VARCHAR(20)  NOT NULL
                             CHECK (benchmark_strategy IN ('all', 'top-85%')),
  total_scorable_nodes     INTEGER,
  benchmark_node_count     INTEGER,
  benchmark_impression_pct NUMERIC(5,1),   -- achieved %, e.g. 87.3
  benchmark_avg_ctr        NUMERIC(8,4),
  benchmark_avg_cvr        NUMERIC(8,4),
  trimming_enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (retailer_id, range_type, range_start, range_end)
);

CREATE INDEX idx_category_snapshot_periods_retailer
  ON category_snapshot_periods (retailer_id);

COMMENT ON TABLE category_snapshot_periods IS
  'One row per retailer+period recording the category benchmark calculation: which strategy '
  'was used (all vs top-85%), how many nodes, what percentage of impressions they covered, '
  'and the derived avg CTR/CVR thresholds used for tier classification. '
  'Used by the Domain Customisation settings UI to display trimming details.';

COMMENT ON COLUMN category_snapshot_periods.benchmark_strategy IS
  'all = all scorable nodes used (small retailer or trimming disabled); '
  'top-85% = nodes accumulated until 85% impression coverage (with min floor of 10).';

-- ============================================================
-- 3. Mark whether each category node was in the benchmark set
-- ============================================================
ALTER TABLE category_performance_snapshots
  ADD COLUMN IF NOT EXISTS in_benchmark BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN category_performance_snapshots.in_benchmark IS
  'TRUE if this category node was included in the benchmark set used to derive avg CTR/CVR '
  'thresholds for tier classification. FALSE for long-tail nodes excluded by the top-85% '
  'impression strategy. All nodes are still stored and classified; this flag identifies which '
  'were used as the performance reference.';

-- ============================================================
-- 4. Domain customisation settings column on retailers
-- ============================================================
ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS domain_settings JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN retailers.domain_settings IS
  'Per-retailer domain customisation settings. '
  'Known keys: '
  '  categories_trimming_enabled (boolean, default true) — when false, all category nodes '
  '    are included in the benchmark regardless of total count, overriding the top-85% rule. '
  'Convention: add a typed column to retailers for settings that need SQL querying or '
  'indexing; use this JSONB for simple flags and configuration values.';

COMMIT;
