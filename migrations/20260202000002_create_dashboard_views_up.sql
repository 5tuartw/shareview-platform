-- Create dashboard_views table for custom view configurations
CREATE TABLE IF NOT EXISTS dashboard_views (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(10) NOT NULL DEFAULT '📊',
    is_default BOOLEAN DEFAULT FALSE,
    column_order JSONB NOT NULL,
    visible_tags JSONB DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on is_default for faster queries
CREATE INDEX IF NOT EXISTS idx_dashboard_views_is_default ON dashboard_views(is_default);

-- Seed with existing views from RSA dashboard
INSERT INTO dashboard_views (name, icon, is_default, column_order, visible_tags) VALUES
(
    'Default View',
    '🔷',
    true,
    '["retailer_name", "gmv", "conversion_rate", "validation_rate", "profit", "roi", "impressions", "google_conversions_transaction", "network_conversions_transaction"]'::jsonb,
    NULL
),
(
    'Hugh''s View 1',
    '🔥',
    false,
    '["retailer_name", "gmv", "profit", "roi", "conversion_rate", "validation_rate", "impressions", "network_clicks", "google_conversions_transaction", "network_conversions_transaction", "commission_validated", "css_spend", "ctr"]'::jsonb,
    '["CPA", "BREAK", "NOREV", "LOSS$", "CPA10", "CPA25"]'::jsonb
),
(
    'All metrics',
    '💫',
    false,
    '["retailer_name", "retailer_id", "category", "tier", "status", "account_manager", "high_priority", "report_month", "report_date", "impressions", "google_clicks", "network_clicks", "assists", "network_conversions_transaction", "google_conversions_transaction", "conversion_difference", "network_conversions_click", "google_conversions_click", "network_conversions_diff", "no_of_orders", "gmv", "commission_unvalidated", "commission_validated", "validation_rate", "css_spend", "profit", "ctr", "cpc", "conversion_rate", "epc", "validated_epc", "net_epc", "roi", "previous_commission_rate", "current_commission_rate", "commission_rate_target", "forecasted_gmv", "alert_count"]'::jsonb,
    NULL
)
ON CONFLICT (name) DO NOTHING;
