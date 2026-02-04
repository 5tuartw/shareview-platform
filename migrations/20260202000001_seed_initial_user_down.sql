-- Migration Rollback Version: 20260202000001
-- Description: Remove initial admin user seed data

BEGIN;

-- Delete the seeded admin user
DELETE FROM users WHERE email = 'admin@shareview.com';

-- Remove migration tracking record
DELETE FROM schema_migrations WHERE version = '20260202000001';

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 20260202000001 rolled back successfully';
    RAISE NOTICE 'Deleted initial admin user: admin@shareview.com';
END $$;
