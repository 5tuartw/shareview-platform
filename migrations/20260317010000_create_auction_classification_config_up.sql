CREATE TABLE auction_classification_settings (
  id SERIAL PRIMARY KEY,
  overlap_high_threshold NUMERIC(6,4) NOT NULL DEFAULT 0.5000,
  impression_share_high_threshold NUMERIC(6,4) NOT NULL DEFAULT 0.3000,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE auction_classification_overrides (
  id SERIAL PRIMARY KEY,
  retailer_id VARCHAR(50) NOT NULL REFERENCES retailers(retailer_id) ON DELETE CASCADE,
  overlap_high_threshold NUMERIC(6,4),
  impression_share_high_threshold NUMERIC(6,4),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE (retailer_id)
);

INSERT INTO auction_classification_settings (id, overlap_high_threshold, impression_share_high_threshold)
VALUES (1, 0.5000, 0.3000)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX idx_auction_classification_overrides_active
  ON auction_classification_overrides (is_active, retailer_id);