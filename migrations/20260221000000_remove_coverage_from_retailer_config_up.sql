BEGIN;

-- Remove 'coverage' from all visible_tabs arrays in retailer_config
-- This is idempotent: if 'coverage' is already removed, the array remains unchanged
UPDATE retailer_config
SET visible_tabs = array_remove(visible_tabs, 'coverage')
WHERE 'coverage' = ANY(visible_tabs);

-- Verification: After running this migration, the following query must return 0:
-- SELECT COUNT(*) FROM retailer_config WHERE 'coverage' = ANY(visible_tabs);

COMMIT;
