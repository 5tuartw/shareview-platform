-- Migration: 20260305010000_rename_demo_retailer_id_down

BEGIN;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'retailer_id'
      AND table_name <> 'retailers'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET retailer_id = $1 WHERE retailer_id = $2',
      rec.table_schema,
      rec.table_name
    ) USING '2401', 'demo';
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'retailers') THEN
    IF EXISTS (SELECT 1 FROM retailers WHERE retailer_id = 'demo') AND NOT EXISTS (SELECT 1 FROM retailers WHERE retailer_id = '2401') THEN
      INSERT INTO retailers
      SELECT (jsonb_populate_record(NULL::retailers, to_jsonb(r) || jsonb_build_object('retailer_id', '2401'))).*
      FROM retailers r
      WHERE r.retailer_id = 'demo'
      LIMIT 1;

      DELETE FROM retailers WHERE retailer_id = 'demo';
    END IF;
  END IF;
END $$;

DELETE FROM schema_migrations
WHERE version = '20260305010000';

COMMIT;
