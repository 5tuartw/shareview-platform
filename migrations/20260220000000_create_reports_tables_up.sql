-- Migration Version: 20260220000000
-- Description: Create reports and report_domains tables for the Reports feature

BEGIN;

CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('month', 'week', 'custom')),
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'published', 'archived')),
    report_type VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (report_type IN ('manual', 'scheduled', 'client_requested', 'client_generated')),
    title VARCHAR(200),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    auto_approve BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE report_domains (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    domain VARCHAR(50) NOT NULL CHECK (domain IN ('overview', 'keywords', 'categories', 'products', 'auctions')),
    ai_insight_id INTEGER REFERENCES ai_insights(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_report_domain UNIQUE (report_id, domain)
);

CREATE INDEX idx_reports_retailer_id ON reports(retailer_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_is_active ON reports(is_active);
CREATE INDEX idx_reports_period ON reports(period_start, period_end);
CREATE INDEX idx_reports_retailer_period ON reports(retailer_id, period_start, period_end);
CREATE INDEX idx_reports_report_type ON reports(report_type);
CREATE INDEX idx_report_domains_report_id ON report_domains(report_id);
CREATE INDEX idx_report_domains_ai_insight_id ON report_domains(ai_insight_id);

COMMIT;
