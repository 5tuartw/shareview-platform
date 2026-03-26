-- Migration: 20260325000000_create_brand_catalog_up

BEGIN;

CREATE TABLE brands (
  brand_id BIGSERIAL PRIMARY KEY,
  canonical_name VARCHAR(255) NOT NULL,
  canonical_name_normalized VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT brands_canonical_name_normalized_unique UNIQUE (canonical_name_normalized),
  CONSTRAINT brands_slug_unique UNIQUE (slug),
  CONSTRAINT brands_status_check CHECK (status IN ('active', 'hidden', 'merged'))
);

CREATE TABLE brand_aliases (
  brand_alias_id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(brand_id) ON DELETE CASCADE,
  alias_name VARCHAR(255) NOT NULL,
  alias_name_normalized VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'cur8or-es',
  confidence NUMERIC(5,4),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT brand_aliases_source_alias_unique UNIQUE (source, alias_name_normalized),
  CONSTRAINT brand_aliases_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE retailer_brand_presence (
  retailer_id VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  brand_id BIGINT NOT NULL REFERENCES brands(brand_id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL DEFAULT 'cur8or-es',
  source_brand_alias_id BIGINT REFERENCES brand_aliases(brand_alias_id) ON DELETE SET NULL,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  latest_doc_count INTEGER,
  is_current BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT retailer_brand_presence_pk PRIMARY KEY (retailer_id, brand_id, source),
  CONSTRAINT retailer_brand_presence_latest_doc_count_check CHECK (latest_doc_count IS NULL OR latest_doc_count >= 0)
);

CREATE INDEX idx_brands_status
  ON brands (status);

CREATE INDEX idx_brand_aliases_brand_id
  ON brand_aliases (brand_id);

CREATE INDEX idx_brand_aliases_alias_normalized
  ON brand_aliases (alias_name_normalized);

CREATE INDEX idx_retailer_brand_presence_brand
  ON retailer_brand_presence (brand_id, retailer_id);

CREATE INDEX idx_retailer_brand_presence_retailer_current
  ON retailer_brand_presence (retailer_id, is_current)
  WHERE is_current = true;

CREATE INDEX idx_retailer_brand_presence_source_alias
  ON retailer_brand_presence (source_brand_alias_id)
  WHERE source_brand_alias_id IS NOT NULL;

COMMENT ON TABLE brands IS
  'Canonical brand registry for ShareView, used to unify retailer brand variants into stable brand keys.';

COMMENT ON COLUMN brands.canonical_name_normalized IS
  'Application-normalized canonical brand name used for stable matching and uniqueness.';

COMMENT ON TABLE brand_aliases IS
  'Observed brand-name variants mapped to canonical brands, including source-specific naming drift from external systems.';

COMMENT ON COLUMN brand_aliases.alias_name_normalized IS
  'Application-normalized alias used to resolve observed brand strings to a canonical brand.';

COMMENT ON TABLE retailer_brand_presence IS
  'Current or historical link between a ShareView retailer and a canonical brand, sourced from external catalog extraction.';

COMMENT ON COLUMN retailer_brand_presence.source_brand_alias_id IS
  'Optional pointer to the observed alias that produced this retailer-brand link in the latest ingestion run.';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260325000000', 'Create canonical brand, brand alias, and retailer-brand presence tables', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;