BEGIN;

CREATE TABLE report_schedules (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly')),
    run_day VARCHAR(20) NOT NULL DEFAULT '1st',
    report_period VARCHAR(30) NOT NULL DEFAULT 'previous_period',
    domains TEXT[] NOT NULL DEFAULT ARRAY['overview','keywords','categories','products','auctions'],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(retailer_id)
);

COMMIT;
