-- Migration Verification Script
-- Purpose: Verify successful application of RBAC migrations
-- Usage: psql $DATABASE_URL -f migrations/verify-schema.sql

\echo '=========================================='
\echo 'ShareView Platform Migration Verification'
\echo '=========================================='
\echo ''

-- Check table existence
\echo '1. Checking table existence...'
SELECT 
    tablename,
    CASE 
        WHEN tablename IN ('users', 'user_retailer_access', 'retailer_config', 'activity_log') 
        THEN '✓ EXISTS' 
        ELSE '✗ MISSING' 
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'user_retailer_access', 'retailer_config', 'activity_log')
ORDER BY tablename;

\echo ''
\echo '2. Checking index count...'
SELECT 
    tablename,
    COUNT(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'user_retailer_access', 'retailer_config', 'activity_log')
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo '3. Verifying foreign key constraints...'
SELECT 
    conname as constraint_name,
    conrelid::regclass as from_table,
    confrelid::regclass as to_table
FROM pg_constraint 
WHERE contype = 'f' 
  AND conrelid::regclass::text IN ('user_retailer_access', 'retailer_config', 'activity_log')
ORDER BY from_table, constraint_name;

\echo ''
\echo '4. Checking unique constraints...'
SELECT 
    conname as constraint_name,
    conrelid::regclass as table_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE contype = 'u' 
  AND conrelid::regclass::text IN ('users', 'user_retailer_access')
ORDER BY table_name, constraint_name;

\echo ''
\echo '5. Verifying CHECK constraints...'
SELECT 
    conname as constraint_name,
    conrelid::regclass as table_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE contype = 'c' 
  AND conrelid::regclass::text IN ('users', 'user_retailer_access')
ORDER BY table_name, constraint_name;

\echo ''
\echo '6. Checking seed data (admin user)...'
SELECT 
    id,
    email,
    username,
    full_name,
    role,
    is_active,
    created_at
FROM users 
WHERE role = 'SALES_TEAM'
ORDER BY created_at;

\echo ''
\echo '7. Verifying applied migrations...'
SELECT 
    version,
    description,
    applied_at
FROM schema_migrations
WHERE version LIKE '202602020000%'
ORDER BY version;

\echo ''
\echo '8. Checking table row counts...'
SELECT 
    'users' as table_name,
    COUNT(*) as row_count
FROM users
UNION ALL
SELECT 
    'user_retailer_access',
    COUNT(*)
FROM user_retailer_access
UNION ALL
SELECT 
    'retailer_config',
    COUNT(*)
FROM retailer_config
UNION ALL
SELECT 
    'activity_log',
    COUNT(*)
FROM activity_log;

\echo ''
\echo '9. Verifying GIN indexes on JSONB/array columns...'
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexdef ILIKE '% USING gin %'
  AND tablename IN ('retailer_config')
ORDER BY tablename, indexname;

\echo ''
\echo '=========================================='
\echo 'Verification Complete'
\echo '=========================================='
\echo ''
\echo 'Expected Results:'
\echo '  ✓ 4 tables: users, user_retailer_access, retailer_config, activity_log'
\echo '  ✓ 15 indexes total (3 per users, 3 per user_retailer_access, 3 per retailer_config, 4 per activity_log, plus PKs)'
\echo '  ✓ 1 admin user with SALES_TEAM role'
\echo '  ✓ 2 migration records in schema_migrations'
\echo '  ✓ 3 GIN indexes on retailer_config'
\echo ''
