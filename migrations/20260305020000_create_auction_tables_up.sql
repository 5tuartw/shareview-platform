-- ============================================================================
-- Migration: Create auction insight tables
-- Up: 20260305020000
-- ============================================================================
-- Creates 5 tables for the auction data pipeline:
--   1. auction_slug_assignments  — persistent campaign slug → retailer mapping
--   2. auction_uploads           — CSV import session log
--   3. auction_insights          — one row per campaign × competitor × month
--   4. auction_retailer_overrides — per-retailer transition month account choice
--   5. auction_insights_snapshots — pre-aggregated snapshot per retailer/month

-- ----------------------------------------------------------------------------
-- 1. auction_slug_assignments
-- Persistent mapping from campaign provider+slug to retailer_id.
-- Pre-populated with all known slug aliases from analyse_auction_isolation.py.
-- ----------------------------------------------------------------------------
CREATE TABLE auction_slug_assignments (
  id          SERIAL PRIMARY KEY,
  provider    TEXT NOT NULL,
  slug        TEXT NOT NULL,
  retailer_id VARCHAR(50) REFERENCES retailers(retailer_id) ON DELETE SET NULL,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE (provider, slug)
);

CREATE INDEX idx_auction_slug_assignments_retailer
  ON auction_slug_assignments (retailer_id);

-- Seed with all known slug → retailer mappings
-- Slugs that match the retailer_id directly after provider prefix
-- (e.g. 'octer-boots~catchall' → provider='octer', slug='boots', retailer_id='boots')
-- are intentionally NOT listed here — the TypeScript resolver uses a direct match fallback.
-- Only aliases that DO NOT directly match the retailer_id need explicit entries.
INSERT INTO auction_slug_assignments (provider, slug, retailer_id) VALUES
  -- Octer shared account aliases
  ('octer', 'asdageorge',      'asda-george'),
  ('octer', 'aspinal',         'aspinal-of-london'),
  ('octer', 'cosde',           'cos-de'),
  ('octer', 'hartsofstur',     'harts-of-stur'),
  ('octer', 'harveynichols',   'harvey-nichols'),
  ('octer', 'jdwilliams',      'jd-williams'),
  ('octer', 'loungeunderwear', 'lounge-underwear'),
  ('octer', 'm&s',             'marks-and-spencer'),
  ('octer', 'nobodyschild',    'nobodys-child'),
  ('octer', 'petsathome',      'pets-at-home'),
  ('octer', 'simplybe',        'simply-be'),
  ('octer', 'tkmaxx',          'tk-maxx'),
  ('octer', 'tkmaxxde',        NULL)  -- tk-maxx-de not yet in SV retailers
ON CONFLICT (provider, slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. auction_uploads
-- Each row represents one CSV import session.
-- ----------------------------------------------------------------------------
CREATE TABLE auction_uploads (
  id                   SERIAL PRIMARY KEY,
  uploaded_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  filename             TEXT NOT NULL,
  row_count_raw        INTEGER,
  row_count_matched    INTEGER,
  row_count_unmatched  INTEGER,
  months_covered       TEXT[],
  retailers_affected   TEXT[],
  notes                TEXT,
  created_at           TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_auction_uploads_created_at ON auction_uploads (created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. auction_insights
-- One row per campaign × competitor-or-self × month.
-- retailer_id is nullable — NULL means the campaign slug was not assigned to
-- a retailer at import time and can be back-filled later.
-- ----------------------------------------------------------------------------
CREATE TABLE auction_insights (
  id                    BIGSERIAL PRIMARY KEY,
  upload_id             INTEGER REFERENCES auction_uploads(id) ON DELETE SET NULL,
  retailer_id           VARCHAR(50) REFERENCES retailers(retailer_id) ON DELETE SET NULL,
  month                 DATE NOT NULL,            -- first day of month, e.g. 2026-01-01
  account_name          TEXT,
  customer_id           TEXT,
  campaign_name         TEXT NOT NULL,
  provider              TEXT,                     -- extracted from campaign_name
  slug                  TEXT,                     -- extracted from campaign_name
  shop_display_name     TEXT NOT NULL,
  is_self               BOOLEAN NOT NULL DEFAULT FALSE,
  impr_share            NUMERIC(6,4),             -- 0–1 decimal; NULL if unparseable
  impr_share_is_estimate BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE for '< 10%'
  outranking_share      NUMERIC(6,4),             -- NULL for is_self rows
  overlap_rate          NUMERIC(6,4),             -- NULL for is_self rows
  data_source           TEXT CHECK (data_source IN ('dedicated', 'shared_account', 'transition')),
  preferred_for_display BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Unique constraint: one row per (retailer+month+campaign+competitor).
-- NULL retailer_id values are treated as distinct by Postgres UNIQUE constraints,
-- so unassigned rows can coexist without violating uniqueness.
CREATE UNIQUE INDEX idx_auction_insights_unique
  ON auction_insights (retailer_id, month, campaign_name, shop_display_name)
  WHERE retailer_id IS NOT NULL;

-- Separate partial index for unassigned rows to prevent exact duplicates
CREATE UNIQUE INDEX idx_auction_insights_unassigned_unique
  ON auction_insights (month, campaign_name, shop_display_name)
  WHERE retailer_id IS NULL;

CREATE INDEX idx_auction_insights_retailer_month
  ON auction_insights (retailer_id, month)
  WHERE retailer_id IS NOT NULL;

CREATE INDEX idx_auction_insights_provider_slug
  ON auction_insights (provider, slug);

CREATE INDEX idx_auction_insights_unassigned
  ON auction_insights (provider, slug, month)
  WHERE retailer_id IS NULL;

-- ----------------------------------------------------------------------------
-- 4. auction_retailer_overrides
-- Per-retailer, per-month choice of which account to use (for transition months
-- where multiple accounts held the same campaign slug simultaneously).
-- ----------------------------------------------------------------------------
CREATE TABLE auction_retailer_overrides (
  id                     SERIAL PRIMARY KEY,
  retailer_id            VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  month                  DATE NOT NULL,
  preferred_account_name TEXT NOT NULL,
  preferred_customer_id  TEXT,
  override_reason        TEXT,
  overridden_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE (retailer_id, month)
);

CREATE INDEX idx_auction_retailer_overrides_retailer
  ON auction_retailer_overrides (retailer_id, month);

-- ----------------------------------------------------------------------------
-- 5. auction_insights_snapshots
-- Pre-aggregated per retailer/month, consumed by the report viewer and
-- RetailerSelectionPage domain health indicators.
-- ----------------------------------------------------------------------------
CREATE TABLE auction_insights_snapshots (
  id                              SERIAL PRIMARY KEY,
  retailer_id                     VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  range_type                      TEXT NOT NULL DEFAULT 'month',
  range_start                     DATE NOT NULL,
  range_end                       DATE NOT NULL,
  snapshot_date                   DATE,
  last_updated                    TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  -- Our impression share (from is_self=TRUE rows)
  avg_impression_share            NUMERIC(6,4),
  our_impr_is_estimate            BOOLEAN,
  -- Competitor summary
  total_competitors               INTEGER,
  avg_overlap_rate                NUMERIC(6,4),
  avg_outranking_share            NUMERIC(6,4),
  avg_being_outranked             NUMERIC(6,4),
  -- Top 20 competitors by overlap (JSONB array)
  competitors                     JSONB,
  -- Named competitor highlights
  top_competitor_id               TEXT,
  top_competitor_overlap_rate     NUMERIC(6,4),
  top_competitor_outranking_you   NUMERIC(6,4),
  biggest_threat_id               TEXT,
  biggest_threat_overlap_rate     NUMERIC(6,4),
  biggest_threat_outranking_you   NUMERIC(6,4),
  best_opportunity_id             TEXT,
  best_opportunity_overlap_rate   NUMERIC(6,4),
  best_opportunity_you_outranking NUMERIC(6,4),
  -- Source metadata
  data_source                     TEXT,
  account_name                    TEXT,
  actual_data_start               DATE,
  actual_data_end                 DATE,
  UNIQUE (retailer_id, range_type, range_start, range_end)
);

CREATE INDEX idx_auction_snapshots_retailer_range
  ON auction_insights_snapshots (retailer_id, range_start DESC);
