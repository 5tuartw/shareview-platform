-- Migration Version: 20260301000000 (down)
-- Description: Remove token_type from retailer_access_tokens

BEGIN;

DROP INDEX IF EXISTS idx_retailer_access_tokens_type;
ALTER TABLE retailer_access_tokens DROP COLUMN IF EXISTS token_type;

COMMIT;
