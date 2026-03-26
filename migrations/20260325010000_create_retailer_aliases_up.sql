-- Migration: 20260325010000_create_retailer_aliases_up

BEGIN;

CREATE TABLE retailer_aliases (
  retailer_alias_id BIGSERIAL PRIMARY KEY,
  retailer_id VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  alias_name VARCHAR(255) NOT NULL,
  alias_name_normalized VARCHAR(255) NOT NULL,
  alias_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  confidence NUMERIC(5,4),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT retailer_aliases_alias_type_check CHECK (
    alias_type IN ('manual', 'display_name', 'search_term', 'typo', 'legacy', 'provider_specific')
  ),
  CONSTRAINT retailer_aliases_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  CONSTRAINT retailer_aliases_source_alias_unique UNIQUE (source, alias_name_normalized)
);

CREATE INDEX idx_retailer_aliases_retailer_id
  ON retailer_aliases (retailer_id);

CREATE INDEX idx_retailer_aliases_alias_normalized_active
  ON retailer_aliases (alias_name_normalized, is_active);

CREATE INDEX idx_retailer_aliases_alias_type
  ON retailer_aliases (alias_type);

COMMENT ON TABLE retailer_aliases IS
  'Canonical retailer alias registry for search-term processing, typo resolution, and provider-specific retailer naming.';

COMMENT ON COLUMN retailer_aliases.alias_name_normalized IS
  'Application-normalized alias used for deterministic retailer matching.';

COMMENT ON COLUMN retailer_aliases.alias_type IS
  'Classification of alias usage, e.g. display_name, search_term, typo, or provider_specific.';

COMMENT ON COLUMN retailer_aliases.source IS
  'Origin of the alias record, e.g. manual, google-ads, cur8or-es, or search-term review.';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260325010000', 'Create retailer aliases table for deterministic retailer name resolution', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;