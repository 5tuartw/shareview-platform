-- Migration Version: 20260218000000
-- Description: Create AI insights tables with approval workflow

BEGIN;

CREATE TABLE ai_insights (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    page_type VARCHAR(50) NOT NULL,
    tab_name VARCHAR(50) NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    insight_type VARCHAR(30) NOT NULL
        CHECK (insight_type IN ('insight_panel', 'market_analysis', 'recommendation')),
    insight_data JSONB NOT NULL,
    model_name VARCHAR(100),
    model_version VARCHAR(50),
    confidence_score NUMERIC(5, 2),
    prompt_hash VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived')),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    approved_by INT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    published_by INT REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMP,
    review_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ai_insights_period UNIQUE (
        retailer_id,
        page_type,
        tab_name,
        period_start,
        period_end,
        insight_type
    )
);

CREATE TABLE insights_generation_jobs (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    page_type VARCHAR(50) NOT NULL,
    tab_name VARCHAR(50) NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_ai_insights_retailer ON ai_insights(retailer_id);
CREATE INDEX idx_ai_insights_status ON ai_insights(status);
CREATE INDEX idx_ai_insights_active ON ai_insights(is_active);
CREATE INDEX idx_ai_insights_period ON ai_insights(period_start, period_end);
CREATE INDEX idx_ai_insights_page_tab ON ai_insights(page_type, tab_name);
CREATE INDEX idx_generation_jobs_status ON insights_generation_jobs(status);
CREATE INDEX idx_generation_jobs_created ON insights_generation_jobs(created_at DESC);

COMMIT;
