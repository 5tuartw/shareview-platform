-- Migration: 20260228000000_unify_retailer_tables_down
-- Reverses the retailers table unification: recreates retailer_metadata and retailer_config,
-- migrates data back, and restores FK constraints.

BEGIN;

-- ============================================================
-- 1. Recreate retailer_metadata
-- ============================================================
CREATE TABLE retailer_metadata (
  retailer_id             VARCHAR(50)   PRIMARY KEY,
  retailer_name           VARCHAR(255)  NOT NULL,
  category                VARCHAR(100),
  tier                    VARCHAR(50),
  account_manager         VARCHAR(100),
  status                  VARCHAR(50)   DEFAULT 'active',
  onboarding_date         DATE,
  contract_end_date       DATE,
  target_roi              NUMERIC(5,2),
  target_gmv              NUMERIC(12,2),
  commission_rate_locked  BOOLEAN       DEFAULT false,
  is_test_account         BOOLEAN       DEFAULT false,
  requires_manual_review  BOOLEAN       DEFAULT false,
  high_priority           BOOLEAN       DEFAULT false,
  primary_contact_email   VARCHAR(255),
  primary_contact_name    VARCHAR(255),
  notes                   TEXT,
  internal_notes          TEXT,
  created_at              TIMESTAMP     DEFAULT NOW(),
  updated_at              TIMESTAMP     DEFAULT NOW(),
  last_contacted_at       TIMESTAMP,
  sector                  VARCHAR(50),
  snapshot_enabled        BOOLEAN       DEFAULT false,
  snapshot_default_ranges TEXT[]        DEFAULT ARRAY['month'],
  snapshot_detail_level   VARCHAR(20)   DEFAULT 'summary',
  snapshot_retention_days INTEGER       DEFAULT 90,
  CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'testing', 'archived')),
  CONSTRAINT retailer_metadata_snapshot_detail_level_check CHECK (
    snapshot_detail_level IN ('summary', 'detail', 'full')
  )
);

CREATE INDEX idx_retailer_metadata_category  ON retailer_metadata (category);
CREATE INDEX idx_retailer_metadata_manager   ON retailer_metadata (account_manager);
CREATE INDEX idx_retailer_metadata_priority  ON retailer_metadata (high_priority);
CREATE INDEX idx_retailer_metadata_status    ON retailer_metadata (status);
CREATE INDEX idx_retailer_metadata_tier      ON retailer_metadata (tier);
CREATE INDEX idx_retailer_sector             ON retailer_metadata (sector) WHERE sector IS NOT NULL;

-- ============================================================
-- 2. Recreate retailer_config
-- ============================================================
CREATE TABLE retailer_config (
  retailer_id       VARCHAR(50)   PRIMARY KEY REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE,
  visible_tabs      TEXT[]        DEFAULT ARRAY['overview','keywords','categories','products','auctions','coverage'],
  visible_metrics   TEXT[]        DEFAULT ARRAY['gmv','conversions','cvr','impressions','ctr'],
  keyword_filters   TEXT[]        DEFAULT ARRAY[]::TEXT[],
  features_enabled  JSONB         DEFAULT '{"insights": true, "market_insights": true, "competitor_comparison": true}'::JSONB,
  updated_by        INTEGER       REFERENCES users(id),
  updated_at        TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retailer_config_features ON retailer_config USING GIN (features_enabled);
CREATE INDEX idx_retailer_config_metrics  ON retailer_config USING GIN (visible_metrics);
CREATE INDEX idx_retailer_config_tabs     ON retailer_config USING GIN (visible_tabs);

-- ============================================================
-- 3. Restore data into retailer_metadata from retailers
-- ============================================================
INSERT INTO retailer_metadata (
  retailer_id, retailer_name,
  category, tier, account_manager, status,
  onboarding_date, contract_end_date, target_roi, target_gmv,
  commission_rate_locked, is_test_account, requires_manual_review, high_priority,
  primary_contact_email, primary_contact_name,
  notes, internal_notes, last_contacted_at, sector,
  snapshot_enabled, snapshot_default_ranges, snapshot_detail_level, snapshot_retention_days,
  created_at, updated_at
)
SELECT
  retailer_id, retailer_name,
  category, tier, account_manager, status,
  onboarding_date, contract_end_date, target_roi, target_gmv,
  commission_rate_locked, is_test_account, requires_manual_review, high_priority,
  primary_contact_email, primary_contact_name,
  notes, internal_notes, last_contacted_at, sector,
  snapshot_enabled, snapshot_default_ranges, snapshot_detail_level, snapshot_retention_days,
  created_at, updated_at
FROM retailers;

-- ============================================================
-- 4. Restore data into retailer_config from retailers
-- ============================================================
INSERT INTO retailer_config (
  retailer_id, visible_tabs, visible_metrics, keyword_filters,
  features_enabled, updated_by, updated_at
)
SELECT
  retailer_id, visible_tabs, visible_metrics, keyword_filters,
  features_enabled, config_updated_by, updated_at
FROM retailers;

-- ============================================================
-- 5. Restore FK constraints back to retailer_metadata
-- ============================================================
ALTER TABLE activity_log
  DROP CONSTRAINT activity_log_retailer_id_fkey,
  ADD  CONSTRAINT activity_log_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailer_metadata(retailer_id) ON DELETE SET NULL;

ALTER TABLE report_schedules
  DROP CONSTRAINT report_schedules_retailer_id_fkey,
  ADD  CONSTRAINT report_schedules_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE;

ALTER TABLE retailer_access_tokens
  DROP CONSTRAINT retailer_access_tokens_retailer_id_fkey,
  ADD  CONSTRAINT retailer_access_tokens_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE;

ALTER TABLE user_retailer_access
  DROP CONSTRAINT user_retailer_access_retailer_id_fkey,
  ADD  CONSTRAINT user_retailer_access_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE;

-- ============================================================
-- 6. Drop the unified table
-- ============================================================
DROP TABLE retailers;

-- ============================================================
-- 7. Remove migration record
-- ============================================================
DELETE FROM schema_migrations WHERE version = '20260228000000';

COMMIT;
