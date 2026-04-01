-- Keyword threshold tiers: configurable qualification tiers for keyword snapshot generation.
-- Retailers are assigned to a tier (or get custom overrides) to control how many
-- search terms qualify for quadrant analysis.

CREATE TABLE IF NOT EXISTS keyword_threshold_tiers (
  id SERIAL PRIMARY KEY,
  tier_name VARCHAR(50) NOT NULL UNIQUE,
  display_order INT NOT NULL DEFAULT 0,
  min_impressions INT NOT NULL DEFAULT 50,
  min_clicks INT NOT NULL DEFAULT 5,
  fallback_min_impressions INT NOT NULL DEFAULT 30,
  fallback_min_clicks INT NOT NULL DEFAULT 3,
  low_volume_trigger_qualified INT NOT NULL DEFAULT 30,
  low_volume_trigger_positive INT NOT NULL DEFAULT 20,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Only one tier can be the default
CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_threshold_tiers_default
  ON keyword_threshold_tiers (is_default) WHERE is_default = TRUE;

-- Per-retailer overrides: assign a retailer to a specific tier, or set fully custom values.
CREATE TABLE IF NOT EXISTS keyword_threshold_overrides (
  id SERIAL PRIMARY KEY,
  retailer_id VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  tier_id INT REFERENCES keyword_threshold_tiers(id) ON DELETE SET NULL,
  -- Custom values override the tier when set (NULL = use tier value)
  custom_min_impressions INT,
  custom_min_clicks INT,
  custom_fallback_min_impressions INT,
  custom_fallback_min_clicks INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE (retailer_id)
);

-- Seed default tiers based on analysis of Jan-Mar 2026 data
INSERT INTO keyword_threshold_tiers (tier_name, display_order, min_impressions, min_clicks, fallback_min_impressions, fallback_min_clicks, low_volume_trigger_qualified, low_volume_trigger_positive, is_default)
VALUES
  ('Standard', 1, 50, 5, 30, 3, 30, 20, TRUE),
  ('Relaxed', 2, 10, 1, 5, 1, 15, 10, FALSE),
  ('Minimal', 3, 3, 1, 1, 1, 10, 5, FALSE)
ON CONFLICT DO NOTHING;
