-- Migration: 20260305010000_rename_demo_retailer_id_up

BEGIN;

DO $$
DECLARE
  rec RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'retailers') THEN
    IF EXISTS (SELECT 1 FROM retailers WHERE retailer_id IN ('2401', 'boots')) THEN
      IF NOT EXISTS (SELECT 1 FROM retailers WHERE retailer_id = 'demo') THEN
        INSERT INTO retailers
        SELECT (jsonb_populate_record(
          NULL::retailers,
          to_jsonb(r)
            || jsonb_build_object('retailer_id', 'demo')
            || jsonb_build_object('source_retailer_id', NULL)
            || jsonb_build_object('retailer_name', 'Meridian Health')
        )).*
        FROM retailers r
        WHERE r.retailer_id = '2401'
        LIMIT 1;

        IF NOT FOUND THEN
          INSERT INTO retailers
          SELECT (jsonb_populate_record(
            NULL::retailers,
            to_jsonb(r)
              || jsonb_build_object('retailer_id', 'demo')
              || jsonb_build_object('source_retailer_id', NULL)
              || jsonb_build_object('retailer_name', 'Meridian Health')
          )).*
          FROM retailers r
          WHERE r.retailer_id = 'boots'
          LIMIT 1;
        END IF;
      END IF;

      FOR rec IN
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'retailer_id'
          AND table_name <> 'retailers'
      LOOP
        EXECUTE format(
          'UPDATE %I.%I SET retailer_id = $1 WHERE retailer_id IN ($2, $3)',
          rec.table_schema,
          rec.table_name
        ) USING 'demo', '2401', 'boots';
      END LOOP;

      UPDATE retailers
      SET is_demo = true,
          retailer_name = 'Meridian Health'
      WHERE retailer_id = 'demo';

      DELETE FROM retailers
      WHERE retailer_id IN ('2401', 'boots');
    END IF;
  END IF;
END $$;

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260305010000', 'Rename demo retailer_id from 2401/boots to demo', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
