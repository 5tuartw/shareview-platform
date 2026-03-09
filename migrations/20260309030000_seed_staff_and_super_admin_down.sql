BEGIN;

-- Remove generic Staff test account created by this migration.
DELETE FROM users
WHERE email = 'staff@shareight.com'
  AND username = 'staff_shareight';

-- Revert admin role to seeded default.
UPDATE users
SET role = 'SALES_TEAM',
    updated_at = NOW()
WHERE email = 'admin@shareight.com';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email = 'admin@shareight.com')
     AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@shareview.com') THEN
    UPDATE users
    SET email = 'admin@shareview.com',
        updated_at = NOW()
    WHERE email = 'admin@shareight.com';
  END IF;
END $$;

DELETE FROM schema_migrations
WHERE version = '20260309030000';

COMMIT;
