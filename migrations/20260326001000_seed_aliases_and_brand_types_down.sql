-- Migration: 20260326001000_seed_aliases_and_brand_types_down

BEGIN;

DELETE FROM retailer_aliases
WHERE source = 'seed-20260326';

DELETE FROM brand_aliases
WHERE source = 'seed-20260326';

UPDATE brands
SET
  brand_type = '3rd_party',
  brand_type_retailer_id = NULL,
  updated_at = NOW()
WHERE canonical_name IN (
  'ARKET',
  'Aspinal of London',
  'Autograph',
  'Brora',
  'George',
  'Jacamo',
  'JD Williams',
  'LEGO',
  'Logik',
  'M&S',
  'Nobody''s Child',
  'Pets at Home',
  'Sephora Collection',
  'Simply Be',
  'Uniqlo'
);

DELETE FROM schema_migrations
WHERE version = '20260326001000';

COMMIT;