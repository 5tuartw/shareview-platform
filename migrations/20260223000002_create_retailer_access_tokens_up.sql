BEGIN;

CREATE TABLE retailer_access_tokens (
    id SERIAL PRIMARY KEY,
    retailer_id VARCHAR(50) NOT NULL REFERENCES retailer_metadata(retailer_id) ON DELETE CASCADE,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP,
    password_hash VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_tokens_token ON retailer_access_tokens(token);
CREATE INDEX idx_access_tokens_retailer_id ON retailer_access_tokens(retailer_id);

COMMIT;
