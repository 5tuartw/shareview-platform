-- Migration: 20260309010000_create_activ8_demo2_from_jd_williams_up
-- Clone JD Williams snapshot data into frozen demo retailer demo2 (Activ8)
-- with strict text masking for JD terms in search/product-facing JSON payloads.

BEGIN;

DO $$
DECLARE
  has_source BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM retailers
    WHERE retailer_id = 'jd-williams'
  ) INTO has_source;

  IF NOT has_source THEN
    RAISE NOTICE 'Source retailer jd-williams not found; skipping demo2 clone.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM retailers
    WHERE retailer_id = 'demo2'
  ) THEN
    INSERT INTO retailers
    SELECT (
      jsonb_populate_record(
        NULL::retailers,
        to_jsonb(r)
          || jsonb_build_object('retailer_id', 'demo2')
          || jsonb_build_object('retailer_name', 'Activ8')
          || jsonb_build_object('source_retailer_id', NULL)
          || jsonb_build_object('is_demo', true)
          || jsonb_build_object('snapshot_enabled', false)
          || jsonb_build_object('data_activity_status', 'inactive')
          || jsonb_build_object('last_data_date', NULL)
          || jsonb_build_object('updated_at', NOW())
      )
    ).*
    FROM retailers r
    WHERE r.retailer_id = 'jd-williams'
    LIMIT 1;
  ELSE
    UPDATE retailers
    SET retailer_name = 'Activ8',
        source_retailer_id = NULL,
        is_demo = true,
        snapshot_enabled = false,
        data_activity_status = 'inactive',
        last_data_date = NULL,
        updated_at = NOW()
    WHERE retailer_id = 'demo2';
  END IF;
END $$;

-- Clone snapshot tables (idempotent via unique range constraints)
INSERT INTO keywords_snapshots
SELECT (
  jsonb_populate_record(
    NULL::keywords_snapshots,
    to_jsonb(s)
      || jsonb_build_object('id', nextval(pg_get_serial_sequence('keywords_snapshots', 'id')))
      || jsonb_build_object('retailer_id', 'demo2')
      || jsonb_build_object('snapshot_date', CURRENT_DATE)
      || jsonb_build_object('last_updated', NOW())
  )
).*
FROM keywords_snapshots s
WHERE s.retailer_id = 'jd-williams'
ON CONFLICT (retailer_id, range_type, range_start, range_end) DO NOTHING;

INSERT INTO category_performance_snapshots
SELECT (
  jsonb_populate_record(
    NULL::category_performance_snapshots,
    to_jsonb(s)
      || jsonb_build_object('id', nextval(pg_get_serial_sequence('category_performance_snapshots', 'id')))
      || jsonb_build_object('retailer_id', 'demo2')
      || jsonb_build_object('snapshot_date', CURRENT_DATE)
      || jsonb_build_object('last_updated', NOW())
  )
).*
FROM category_performance_snapshots s
WHERE s.retailer_id = 'jd-williams'
  AND NOT EXISTS (
    SELECT 1
    FROM category_performance_snapshots d
    WHERE d.retailer_id = 'demo2'
      AND d.range_type = s.range_type
      AND d.range_start = s.range_start
      AND d.range_end = s.range_end
  );

INSERT INTO product_performance_snapshots
SELECT (
  jsonb_populate_record(
    NULL::product_performance_snapshots,
    to_jsonb(s)
      || jsonb_build_object('id', nextval(pg_get_serial_sequence('product_performance_snapshots', 'id')))
      || jsonb_build_object('retailer_id', 'demo2')
      || jsonb_build_object('snapshot_date', CURRENT_DATE)
      || jsonb_build_object('last_updated', NOW())
  )
).*
FROM product_performance_snapshots s
WHERE s.retailer_id = 'jd-williams'
ON CONFLICT (retailer_id, range_type, range_start, range_end) DO NOTHING;

INSERT INTO auction_insights_snapshots
SELECT (
  jsonb_populate_record(
    NULL::auction_insights_snapshots,
    to_jsonb(s)
      || jsonb_build_object('id', nextval(pg_get_serial_sequence('auction_insights_snapshots', 'id')))
      || jsonb_build_object('retailer_id', 'demo2')
      || jsonb_build_object('snapshot_date', CURRENT_DATE)
      || jsonb_build_object('last_updated', NOW())
  )
).*
FROM auction_insights_snapshots s
WHERE s.retailer_id = 'jd-williams'
ON CONFLICT (retailer_id, range_type, range_start, range_end) DO NOTHING;

INSERT INTO product_coverage_snapshots
SELECT (
  jsonb_populate_record(
    NULL::product_coverage_snapshots,
    to_jsonb(s)
      || jsonb_build_object('id', nextval(pg_get_serial_sequence('product_coverage_snapshots', 'id')))
      || jsonb_build_object('retailer_id', 'demo2')
      || jsonb_build_object('snapshot_date', CURRENT_DATE)
      || jsonb_build_object('last_updated', NOW())
  )
).*
FROM product_coverage_snapshots s
WHERE s.retailer_id = 'jd-williams'
ON CONFLICT (retailer_id, range_type, range_start, range_end) DO NOTHING;

-- Helpers for strict JD-term replacement within JSONB payloads.
CREATE OR REPLACE FUNCTION _demo2_replace_jd_terms(input_text TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(COALESCE(input_text, ''), '(?i)\\mjd[[:space:]]*-[[:space:]]*williams\\M', 'Activ8', 'g'),
               '(?i)jd[[:space:]]+williams',
               'Activ8',
               'g'
             ),
             '(?i)jdwilliams',
             'Activ8',
             'g'
           ),
             '(?i)(^|[^[:alnum:]])jdw([^[:alnum:]]|$)',
             E'\\1a8\\2',
             'g'
           ),
           '(?i)(^|[^[:alnum:]])jd([^[:alnum:]]|$)',
           E'\\1Activ8\\2',
           'g'
         );
$$;

-- Apply strict sanitisation to cloned, customer-facing snapshot payloads.
UPDATE keywords_snapshots
SET top_keywords = CASE
      WHEN top_keywords IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(top_keywords::text)::jsonb
    END,
    bottom_keywords = CASE
      WHEN bottom_keywords IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(bottom_keywords::text)::jsonb
    END,
    last_updated = NOW()
WHERE retailer_id = 'demo2';

UPDATE product_performance_snapshots
SET top_performers = CASE
      WHEN top_performers IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(top_performers::text)::jsonb
    END,
    underperformers = CASE
      WHEN underperformers IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(underperformers::text)::jsonb
    END,
    product_classifications = CASE
      WHEN product_classifications IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(product_classifications::text)::jsonb
    END,
    last_updated = NOW()
WHERE retailer_id = 'demo2';

UPDATE auction_insights_snapshots
SET competitors = CASE
      WHEN competitors IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(competitors::text)::jsonb
    END,
    last_updated = NOW()
WHERE retailer_id = 'demo2';

UPDATE product_coverage_snapshots
SET top_category = CASE
      WHEN top_category IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(top_category::text)::jsonb
    END,
    biggest_gap = CASE
      WHEN biggest_gap IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(biggest_gap::text)::jsonb
    END,
    categories = CASE
      WHEN categories IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(categories::text)::jsonb
    END,
    distribution = CASE
      WHEN distribution IS NULL THEN NULL
      ELSE _demo2_replace_jd_terms(distribution::text)::jsonb
    END,
    last_updated = NOW()
WHERE retailer_id = 'demo2';

-- Remove helper functions; they are migration-local utilities.
DROP FUNCTION IF EXISTS _demo2_replace_jd_terms(TEXT);

INSERT INTO schema_migrations (version, description, applied_at)
VALUES (
  '20260309010000',
  'Create frozen demo2 retailer Activ8 from JD Williams snapshots with strict text sanitisation',
  NOW()
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
