BEGIN;

CREATE TABLE IF NOT EXISTS llm_batch_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  model TEXT,
  execution_mode TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  updated_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT llm_batch_jobs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_status_created_at
  ON llm_batch_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_type_created_at
  ON llm_batch_jobs(job_type, created_at DESC);

INSERT INTO schema_migrations (version, description)
VALUES ('20260309020000', 'Create llm_batch_jobs table for generic LLM batch orchestration')
ON CONFLICT (version) DO NOTHING;

COMMIT;
