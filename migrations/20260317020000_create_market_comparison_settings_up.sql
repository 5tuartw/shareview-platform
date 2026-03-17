CREATE TABLE IF NOT EXISTS market_comparison_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  allow_ai_assigned_profile_values BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO market_comparison_settings (id, allow_ai_assigned_profile_values)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;
