-- Migration: 20260306000000_create_retailer_data_availability_up
-- Purpose: Store per-retailer period availability by domain and granularity.

CREATE TABLE retailer_data_availability (
  retailer_id VARCHAR(255) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  domain VARCHAR(32) NOT NULL CHECK (domain IN ('overview', 'keywords', 'categories', 'products', 'auctions')),
  granularity VARCHAR(16) NOT NULL CHECK (granularity IN ('month', 'week')),
  period VARCHAR(16) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  actual_data_start DATE,
  actual_data_end DATE,
  source_system VARCHAR(16) NOT NULL CHECK (source_system IN ('shareview', 'rsr')),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (retailer_id, domain, granularity, period)
);

CREATE INDEX idx_retailer_data_availability_lookup
  ON retailer_data_availability (retailer_id, domain, granularity, period_start);

CREATE INDEX idx_retailer_data_availability_domain_period
  ON retailer_data_availability (domain, granularity, period_start);

COMMENT ON TABLE retailer_data_availability IS
  'Persisted period availability for each retailer and domain, refreshed by the analytics pipeline.';

COMMENT ON COLUMN retailer_data_availability.period IS
  'Display period key (YYYY-MM for month, YYYY-MM-DD for week).';
