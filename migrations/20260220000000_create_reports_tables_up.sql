-- Migration Version: 20260220000000
-- Description: Create reports and report_domains tables

BEGIN;

CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    retailer_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
    title TEXT,
    summary TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    published_at TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE report_domains (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    domain TEXT NOT NULL CHECK (domain IN ('overview', 'keywords', 'categories', 'products', 'auctions')),
    ai_insight_id INTEGER REFERENCES ai_insights(id) ON DELETE SET NULL,
    manual_content TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_report_domain UNIQUE (report_id, domain)
);

CREATE INDEX idx_reports_retailer_id ON reports(retailer_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_is_active ON reports(is_active);
CREATE INDEX idx_reports_period ON reports(period_start, period_end);
CREATE INDEX idx_report_domains_report_id ON report_domains(report_id);
CREATE INDEX idx_report_domains_ai_insight_id ON report_domains(ai_insight_id);

COMMIT;
