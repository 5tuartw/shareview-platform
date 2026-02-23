-- Migration Version: 20260221000001
-- Description: Fix period_type constraint to allow 'monthly' and add 'client_generated' period type

BEGIN;

-- Drop the old constraint
ALTER TABLE reports DROP CONSTRAINT reports_period_type_check;

-- Add new constraint with correct values
ALTER TABLE reports ADD CONSTRAINT reports_period_type_check 
    CHECK (period_type IN ('monthly', 'weekly', 'custom', 'client_generated'));

COMMIT;
