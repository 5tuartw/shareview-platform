-- Migration: 20260304000000_add_link_password_settings_to_retailers_up

BEGIN;

ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS always_password_protect_links BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_password_mode VARCHAR(10) NOT NULL DEFAULT 'unique',
  ADD COLUMN IF NOT EXISTS shared_link_password_hash VARCHAR(255);

ALTER TABLE retailers
  DROP CONSTRAINT IF EXISTS retailers_link_password_mode_check;

ALTER TABLE retailers
  ADD CONSTRAINT retailers_link_password_mode_check
  CHECK (link_password_mode IN ('shared', 'unique'));

COMMENT ON COLUMN retailers.always_password_protect_links IS
  'When true, newly generated access links are password-protected even if no password is provided in the request.';

COMMENT ON COLUMN retailers.link_password_mode IS
  'Password mode for protected links: shared (reuse retailer shared password) or unique (per-link password).';

COMMENT ON COLUMN retailers.shared_link_password_hash IS
  'Bcrypt hash for retailer-level shared link password; never return this value via API.';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260304000000', 'Add link password protection settings to retailers', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
