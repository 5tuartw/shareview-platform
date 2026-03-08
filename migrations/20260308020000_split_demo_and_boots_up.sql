-- Migration: 20260308020000_split_demo_and_boots_up

BEGIN;

DO $$
DECLARE
  demo_source_id text;
  demo_original_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'retailers'
  ) THEN
    SELECT source_retailer_id, retailer_name
    INTO demo_source_id, demo_original_name
    FROM retailers
    WHERE retailer_id = 'demo'
    LIMIT 1;

    -- Reset demo row back to an isolated demo identity.
    UPDATE retailers
    SET retailer_name = 'Meridian Health',
        source_retailer_id = NULL,
        is_demo = true,
        data_activity_status = 'inactive',
        last_data_date = NULL,
      snapshot_enabled = true,
        updated_at = NOW()
    WHERE retailer_id = 'demo';

    -- If demo previously pointed at Boots source data, create a dedicated Boots row
    -- after clearing demo mapping so the unique source_retailer_id constraint is preserved.
    IF COALESCE(demo_source_id, '') <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM retailers
        WHERE retailer_id = 'boots'
      ) THEN
      INSERT INTO retailers
      SELECT (
        jsonb_populate_record(
          NULL::retailers,
          to_jsonb(r)
            || jsonb_build_object('retailer_id', 'boots')
            || jsonb_build_object('retailer_name', COALESCE(NULLIF(demo_original_name, ''), 'Boots.com'))
            || jsonb_build_object('source_retailer_id', demo_source_id)
            || jsonb_build_object('is_demo', false)
            || jsonb_build_object('snapshot_enabled', false)
            || jsonb_build_object('status', 'active')
        )
      ).*
      FROM retailers r
      WHERE r.retailer_id = 'demo'
      LIMIT 1;
    END IF;
  END IF;
END $$;

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260308020000', 'Split demo retailer identity from Boots source mapping', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
