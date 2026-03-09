-- Migration: 20260309010000_create_admin_ai_settings_up

BEGIN;

CREATE TABLE IF NOT EXISTS admin_ai_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider VARCHAR(20) NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini', 'openai')),
  model VARCHAR(120) NOT NULL DEFAULT 'gemini-2.5-flash',
  execution_mode VARCHAR(20) NOT NULL DEFAULT 'chunked_sync' CHECK (execution_mode IN ('chunked_sync', 'provider_batch')),
  chunk_size INTEGER NOT NULL DEFAULT 12 CHECK (chunk_size >= 1 AND chunk_size <= 100),
  api_key_env_var VARCHAR(80),
  updated_by INTEGER,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO admin_ai_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260309010000', 'Create admin AI settings table for provider/model/chunk configuration', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
