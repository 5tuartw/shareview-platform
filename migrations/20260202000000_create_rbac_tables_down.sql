-- Migration Rollback Version: 20260202000000
-- Description: Rollback RBAC tables creation

BEGIN;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS retailer_config CASCADE;
DROP TABLE IF EXISTS user_retailer_access CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Remove migration tracking record
DELETE FROM schema_migrations WHERE version = '20260202000000';

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 20260202000000 rolled back successfully';
    RAISE NOTICE 'Dropped tables: activity_log, retailer_config, user_retailer_access, users';
END $$;
