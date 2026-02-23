-- Migration Version: 20260221000001
-- Description: Rollback period_type constraint fix

BEGIN;

-- Drop the new constraint
ALTER TABLE reports DROP CONSTRAINT reports_period_type_check;

-- Restore original constraint
ALTER TABLE reports ADD CONSTRAINT reports_period_type_check 
    CHECK (period_type IN ('month', 'week', 'custom'));

COMMIT;
