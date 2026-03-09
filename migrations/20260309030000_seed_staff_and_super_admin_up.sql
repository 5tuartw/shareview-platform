BEGIN;

-- Promote seeded admin account to Super Admin role and align email to shareight domain.
UPDATE users
SET role = 'CSS_ADMIN',
    updated_at = NOW()
WHERE email IN ('admin@shareview.com', 'admin@shareight.com');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email = 'admin@shareview.com')
     AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@shareight.com') THEN
    UPDATE users
    SET email = 'admin@shareight.com',
        updated_at = NOW()
    WHERE email = 'admin@shareview.com';
  END IF;
END $$;

-- Add a generic Staff test account.
-- Password: ShareightStaff2026
INSERT INTO users (email, username, password_hash, full_name, role, is_active, created_at, updated_at)
VALUES (
  'staff@shareight.com',
  'staff_shareight',
  '$2b$10$mY0Fqp2jGoq9RY76B.5WjuKcg9H7tBsXOJNpZ5PfN..4TizpcBIZq',
  'Shareight Staff',
  'SALES_TEAM',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET role = 'SALES_TEAM',
    is_active = true,
    updated_at = NOW();

INSERT INTO schema_migrations (version, description)
VALUES ('20260309030000', 'Seed staff@shareight.com and promote admin account to Super Admin')
ON CONFLICT (version) DO NOTHING;

COMMIT;
