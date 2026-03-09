BEGIN;

DROP TABLE IF EXISTS llm_batch_jobs;

DELETE FROM schema_migrations
WHERE version = '20260309020000';

COMMIT;
