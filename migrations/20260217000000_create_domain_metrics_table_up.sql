-- Migration Version: 20260217000000
-- Description: Create domain_metrics table for algorithmic metrics components
-- Dependencies: None

BEGIN;

CREATE TABLE domain_metrics (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    page_type VARCHAR(50) NOT NULL,
    tab_name VARCHAR(50) NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('month', 'week', 'custom')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    component_type VARCHAR(50) NOT NULL CHECK (component_type IN (
        'page_headline', 'metric_card', 'quick_stats', 'contextual_info'
    )),
    component_data JSONB NOT NULL,
    calculated_at TIMESTAMP DEFAULT NOW(),
    source_snapshot_id INTEGER,
    calculation_method VARCHAR(50) DEFAULT 'algorithmic',
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT unique_domain_metric UNIQUE (
        retailer_id, page_type, tab_name, period_start, period_end, component_type
    )
);

CREATE INDEX idx_domain_metrics_retailer ON domain_metrics(retailer_id);
CREATE INDEX idx_domain_metrics_period ON domain_metrics(period_start, period_end);
CREATE INDEX idx_domain_metrics_active ON domain_metrics(is_active);
CREATE INDEX idx_domain_metrics_page_tab ON domain_metrics(page_type, tab_name);

COMMIT;
