BEGIN;

DROP TRIGGER IF EXISTS trg_prevent_last_active_super_admin_change ON users;
DROP FUNCTION IF EXISTS prevent_last_active_super_admin_change();

DELETE FROM schema_migrations
WHERE version = '20260309040000';

COMMIT;
