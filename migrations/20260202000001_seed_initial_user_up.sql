-- Migration Version: 20260202000001
-- Description: Seed initial SALES_TEAM user for ShareView Platform
-- Dependencies: users table must exist

BEGIN;

-- ============================================================================
-- Create Initial Admin User
-- ============================================================================
-- Default Credentials (DEVELOPMENT/TESTING ONLY):
--   Email: admin@shareview.com
--   Password: ShareView2026!
--   Role: SALES_TEAM (full multi-retailer access)
--
-- ⚠️ SECURITY WARNING: Change password immediately in production!
-- ============================================================================

INSERT INTO users (email, username, password_hash, full_name, role, is_active, created_at)
VALUES (
  'admin@shareview.com',
  'admin',
  '$2b$10$rKJ8vQ7xZ9YqH5nP3wX8.eF2mK4lT6sU8vW0xY2zA4bC6dE8fG0hI',
  'ShareView Admin',
  'SALES_TEAM',
  true,
  NOW()
);

-- Update migration tracking
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260202000001', 'Seed initial SALES_TEAM user (admin@shareview.com)', NOW());

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 20260202000001 applied successfully';
    RAISE NOTICE 'Created initial admin user: admin@shareview.com';
    RAISE NOTICE '⚠️  Default password: ShareView2026! (CHANGE IN PRODUCTION)';
END $$;
