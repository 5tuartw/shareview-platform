-- Migration: 20260228000000_unify_retailer_tables_up
-- Unifies retailer_metadata + retailer_config into a single retailers table,
-- adds source_retailer_id column, and removes lookfantastic / feelunique entries.

BEGIN;

-- ============================================================
-- 1. Create the unified retailers table
-- ============================================================
CREATE TABLE retailers (
  -- Identity
  retailer_id             VARCHAR(50)   PRIMARY KEY,
  retailer_name           VARCHAR(255)  NOT NULL,
  source_retailer_id      VARCHAR(50)   UNIQUE,          -- Analytics-source DB identifier

  -- CRM / account
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
  last_contacted_at       TIMESTAMP,
  sector                  VARCHAR(50),

  -- Snapshot scheduler settings (from retailer_metadata)
  snapshot_enabled        BOOLEAN       DEFAULT false,
  snapshot_default_ranges TEXT[]        DEFAULT ARRAY['month'],
  snapshot_detail_level   VARCHAR(20)   DEFAULT 'summary',
  snapshot_retention_days INTEGER       DEFAULT 90,

  -- Client portal config (from retailer_config)
  visible_tabs            TEXT[]        DEFAULT ARRAY['overview','keywords','categories','products','auctions','coverage'],
  visible_metrics         TEXT[]        DEFAULT ARRAY['gmv','conversions','cvr','impressions','ctr'],
  keyword_filters         TEXT[]        DEFAULT ARRAY[]::TEXT[],
  features_enabled        JSONB         DEFAULT '{"insights": true, "market_insights": true, "competitor_comparison": true}'::JSONB,
  config_updated_by       INTEGER       REFERENCES users(id),

  -- Audit timestamps
  created_at              TIMESTAMP     DEFAULT NOW(),
  updated_at              TIMESTAMP     DEFAULT NOW(),

  CONSTRAINT retailers_valid_status CHECK (
    status IN ('active', 'paused', 'testing', 'archived')
  ),
  CONSTRAINT retailers_snapshot_detail_level_check CHECK (
    snapshot_detail_level IN ('summary', 'detail', 'full')
  )
);

-- ============================================================
-- 2. Populate retailers from existing tables
--    - LEFT JOIN retailer_config to pick up portal settings
--    - Join source_ids CTE to populate source_retailer_id
--    - Exclude lookfantastic and feelunique
-- ============================================================
WITH source_ids (slug, src_id) AS (
  VALUES
    ('arket',              '1011l6451'),
    ('asda-george',        '6400033'),
    ('aspinal-of-london',  '50405'),
    ('boohooman',          '7009'),
    ('boots',              'boots'),       -- temporary: awaiting numeric ID from colleague
    ('brandalley',         '5221712'),
    ('brora',              '17043'),
    ('cos',                '47832'),
    ('cos-de',             '46463'),
    ('currys',             '1599'),
    ('etsy',               '6091'),
    ('fenwick',            '1101l6495'),
    ('flannels',           '1011l6018'),
    ('frasers',            '1100l5964'),
    ('harts-of-stur',      '32187'),
    ('harvey-nichols',     '1101l6310'),
    ('jacamo',             '3026'),
    ('jd-williams',        '3032'),
    ('lego',               '24340'),
    ('levis',              '53153'),
    ('lounge-underwear',   '38798'),
    ('marks-and-spencer',  '1402'),
    ('nobodys-child',      '7090990'),
    ('pets-at-home',       '40864'),
    ('qvc',                '7202610'),
    ('schuh',              '2044'),
    ('sephora',            '1011l6629'),
    ('simply-be',          '3027'),
    ('tk-maxx',            '43244'),
    ('uniqlo',             '6771')
    -- allsaints: omitted here; insert separately once source ID is known
    -- lookfantastic: intentionally excluded (removed from plans)
    -- feelunique: intentionally excluded (removed from plans)
)
INSERT INTO retailers (
  retailer_id, retailer_name, source_retailer_id,
  category, tier, account_manager, status,
  onboarding_date, contract_end_date, target_roi, target_gmv,
  commission_rate_locked, is_test_account, requires_manual_review, high_priority,
  primary_contact_email, primary_contact_name,
  notes, internal_notes, last_contacted_at, sector,
  snapshot_enabled, snapshot_default_ranges, snapshot_detail_level, snapshot_retention_days,
  visible_tabs, visible_metrics, keyword_filters, features_enabled, config_updated_by,
  created_at, updated_at
)
SELECT
  rm.retailer_id,
  rm.retailer_name,
  si.src_id,
  rm.category,
  rm.tier,
  rm.account_manager,
  rm.status,
  rm.onboarding_date,
  rm.contract_end_date,
  rm.target_roi,
  rm.target_gmv,
  rm.commission_rate_locked,
  rm.is_test_account,
  rm.requires_manual_review,
  rm.high_priority,
  rm.primary_contact_email,
  rm.primary_contact_name,
  rm.notes,
  rm.internal_notes,
  rm.last_contacted_at,
  rm.sector,
  rm.snapshot_enabled,
  rm.snapshot_default_ranges,
  rm.snapshot_detail_level,
  rm.snapshot_retention_days,
  COALESCE(rc.visible_tabs,     ARRAY['overview','keywords','categories','products','auctions','coverage']),
  COALESCE(rc.visible_metrics,  ARRAY['gmv','conversions','cvr','impressions','ctr']),
  COALESCE(rc.keyword_filters,  ARRAY[]::TEXT[]),
  COALESCE(rc.features_enabled, '{"insights": true, "market_insights": true, "competitor_comparison": true}'::JSONB),
  rc.updated_by,
  rm.created_at,
  GREATEST(rm.updated_at, rc.updated_at)
FROM retailer_metadata rm
LEFT JOIN retailer_config rc ON rc.retailer_id = rm.retailer_id
LEFT JOIN source_ids si ON si.slug = rm.retailer_id
WHERE rm.retailer_id NOT IN ('lookfantastic', 'feelunique');

-- ============================================================
-- 3. Indexes (mirror what existed on old tables)
-- ============================================================
CREATE INDEX idx_retailers_category        ON retailers (category);
CREATE INDEX idx_retailers_manager         ON retailers (account_manager);
CREATE INDEX idx_retailers_priority        ON retailers (high_priority);
CREATE INDEX idx_retailers_status          ON retailers (status);
CREATE INDEX idx_retailers_tier            ON retailers (tier);
CREATE INDEX idx_retailers_sector          ON retailers (sector) WHERE sector IS NOT NULL;
CREATE INDEX idx_retailers_source_id       ON retailers (source_retailer_id) WHERE source_retailer_id IS NOT NULL;
CREATE INDEX idx_retailers_config_features ON retailers USING GIN (features_enabled);
CREATE INDEX idx_retailers_config_metrics  ON retailers USING GIN (visible_metrics);
CREATE INDEX idx_retailers_config_tabs     ON retailers USING GIN (visible_tabs);

-- ============================================================
-- 4. Clean up references to excluded retailers before migrating FKs
--    (activity_log uses ON DELETE SET NULL; others use ON DELETE CASCADE)
-- ============================================================
UPDATE activity_log
  SET retailer_id = NULL
  WHERE retailer_id IN ('lookfantastic', 'feelunique');

DELETE FROM report_schedules       WHERE retailer_id IN ('lookfantastic', 'feelunique');
DELETE FROM retailer_access_tokens WHERE retailer_id IN ('lookfantastic', 'feelunique');
DELETE FROM user_retailer_access   WHERE retailer_id IN ('lookfantastic', 'feelunique');

-- ============================================================
-- 5. Migrate FK constraints from retailer_metadata → retailers
-- ============================================================

-- activity_log
ALTER TABLE activity_log
  DROP CONSTRAINT activity_log_retailer_id_fkey,
  ADD  CONSTRAINT activity_log_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailers(retailer_id) ON DELETE SET NULL;

-- report_schedules
ALTER TABLE report_schedules
  DROP CONSTRAINT report_schedules_retailer_id_fkey,
  ADD  CONSTRAINT report_schedules_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailers(retailer_id) ON DELETE CASCADE;

-- retailer_access_tokens
ALTER TABLE retailer_access_tokens
  DROP CONSTRAINT retailer_access_tokens_retailer_id_fkey,
  ADD  CONSTRAINT retailer_access_tokens_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailers(retailer_id) ON DELETE CASCADE;

-- user_retailer_access
ALTER TABLE user_retailer_access
  DROP CONSTRAINT user_retailer_access_retailer_id_fkey,
  ADD  CONSTRAINT user_retailer_access_retailer_id_fkey
       FOREIGN KEY (retailer_id) REFERENCES retailers(retailer_id) ON DELETE CASCADE;

-- ============================================================
-- 6. Drop old tables (retailer_config first — it references retailer_metadata)
-- ============================================================
DROP TABLE retailer_config;
DROP TABLE retailer_metadata;

-- ============================================================
-- 7. Record migration
-- ============================================================
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260228000000', 'Unify retailer_metadata and retailer_config into retailers table, add source_retailer_id', NOW());

COMMIT;
