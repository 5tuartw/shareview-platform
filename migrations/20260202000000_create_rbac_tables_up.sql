-- Migration Version: 20260202000000
-- Description: Create RBAC tables for ShareView Platform user management and access control
-- Dependencies: retailer_metadata table must exist

BEGIN;

-- ============================================================================
-- Table 1: users
-- Core user authentication and authorization table
-- ============================================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('CLIENT_VIEWER', 'CLIENT_ADMIN', 'SALES_TEAM', 'CSS_ADMIN')),
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    last_login TIMESTAMP
);

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

COMMENT ON TABLE users IS 'User accounts with role-based access control';
COMMENT ON COLUMN users.role IS 'User role: CLIENT_VIEWER (read-only retailer access), CLIENT_ADMIN (full retailer management), SALES_TEAM (multi-retailer sales access), CSS_ADMIN (full platform access)';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password (cost factor 10)';

-- ============================================================================
-- Table 2: user_retailer_access
-- Maps users to retailers with granular access levels
-- ============================================================================
CREATE TABLE user_retailer_access (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    retailer_id VARCHAR(50) NOT NULL REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE,
    access_level VARCHAR(50) NOT NULL CHECK (access_level IN ('VIEWER', 'ADMIN')),
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, retailer_id)
);

-- User-retailer access indexes
CREATE INDEX idx_user_retailer_user ON user_retailer_access(user_id);
CREATE INDEX idx_user_retailer_retailer ON user_retailer_access(retailer_id);
CREATE INDEX idx_user_retailer_access_level ON user_retailer_access(access_level);

COMMENT ON TABLE user_retailer_access IS 'User access grants to specific retailers';
COMMENT ON COLUMN user_retailer_access.access_level IS 'Access level: VIEWER (read-only), ADMIN (read-write including config)';
COMMENT ON COLUMN user_retailer_access.granted_by IS 'User ID who granted this access (null for system-granted)';

-- ============================================================================
-- Table 3: retailer_config
-- Per-retailer UI customization and feature flags
-- ============================================================================
CREATE TABLE retailer_config (
    retailer_id VARCHAR(50) PRIMARY KEY REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE,
    visible_tabs TEXT[] DEFAULT ARRAY['overview', 'keywords', 'categories', 'products', 'auctions', 'coverage'],
    visible_metrics TEXT[] DEFAULT ARRAY['gmv', 'conversions', 'cvr', 'impressions', 'ctr'],
    keyword_filters TEXT[] DEFAULT ARRAY[]::TEXT[],
    features_enabled JSONB DEFAULT '{"insights": true, "competitor_comparison": true, "market_insights": true}',
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Retailer config indexes
CREATE INDEX idx_retailer_config_tabs ON retailer_config USING GIN(visible_tabs);
CREATE INDEX idx_retailer_config_metrics ON retailer_config USING GIN(visible_metrics);
CREATE INDEX idx_retailer_config_features ON retailer_config USING GIN(features_enabled);

COMMENT ON TABLE retailer_config IS 'Per-retailer UI customization and feature toggles';
COMMENT ON COLUMN retailer_config.visible_tabs IS 'Array of tab names to show in UI (e.g., overview, keywords, categories)';
COMMENT ON COLUMN retailer_config.visible_metrics IS 'Array of metric names to display (e.g., gmv, conversions, cvr)';
COMMENT ON COLUMN retailer_config.keyword_filters IS 'Negative keyword filters to hide from reports';
COMMENT ON COLUMN retailer_config.features_enabled IS 'JSONB object with feature flags (insights, competitor_comparison, market_insights)';

-- ============================================================================
-- Table 4: activity_log
-- Comprehensive audit trail for all user actions
-- ============================================================================
CREATE TABLE activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    retailer_id VARCHAR(50) REFERENCES retailer_metadata(retailer_id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Activity log indexes
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_retailer ON activity_log(retailer_id, created_at DESC);
CREATE INDEX idx_activity_action ON activity_log(action);
CREATE INDEX idx_activity_created ON activity_log(created_at DESC);

COMMENT ON TABLE activity_log IS 'Audit trail of all user actions in the platform';
COMMENT ON COLUMN activity_log.action IS 'Action type (e.g., user_created, config_updated, login, logout)';
COMMENT ON COLUMN activity_log.entity_type IS 'Type of entity affected (e.g., user, config, retailer)';
COMMENT ON COLUMN activity_log.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN activity_log.details IS 'Action-specific data in JSON format';

-- ============================================================================
-- Migration Tracking
-- ============================================================================
-- Create schema_migrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW() NOT NULL
);

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260202000000', 'Create RBAC tables - users, user_retailer_access, retailer_config, activity_log', NOW());

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 20260202000000 applied successfully';
    RAISE NOTICE 'Created tables: users, user_retailer_access, retailer_config, activity_log';
    RAISE NOTICE 'Created 15 indexes for optimal query performance';
END $$;
