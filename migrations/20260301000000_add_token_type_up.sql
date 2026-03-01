-- Migration Version: 20260301000000
-- Description: Add token_type to retailer_access_tokens to distinguish live_data from report_access tokens

BEGIN;

ALTER TABLE retailer_access_tokens
  ADD COLUMN token_type VARCHAR(20) NOT NULL DEFAULT 'live_data';

-- Existing per-report tokens (report_id IS NOT NULL) are report access tokens
UPDATE retailer_access_tokens SET token_type = 'report_access' WHERE report_id IS NOT NULL;

CREATE INDEX idx_retailer_access_tokens_type ON retailer_access_tokens(retailer_id, token_type);

COMMIT;
