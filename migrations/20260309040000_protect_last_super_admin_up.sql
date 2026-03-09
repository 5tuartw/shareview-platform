BEGIN;

CREATE OR REPLACE FUNCTION prevent_last_active_super_admin_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'CSS_ADMIN' AND OLD.is_active = true THEN
      SELECT COUNT(*)
      INTO remaining_count
      FROM users
      WHERE role = 'CSS_ADMIN'
        AND is_active = true
        AND id <> OLD.id;

      IF remaining_count = 0 THEN
        RAISE EXCEPTION 'At least one active Super Admin must remain';
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'CSS_ADMIN'
       AND OLD.is_active = true
       AND (NEW.role <> 'CSS_ADMIN' OR NEW.is_active <> true) THEN
      SELECT COUNT(*)
      INTO remaining_count
      FROM users
      WHERE role = 'CSS_ADMIN'
        AND is_active = true
        AND id <> OLD.id;

      IF remaining_count = 0 THEN
        RAISE EXCEPTION 'At least one active Super Admin must remain';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_active_super_admin_change ON users;

CREATE TRIGGER trg_prevent_last_active_super_admin_change
BEFORE UPDATE OR DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_last_active_super_admin_change();

INSERT INTO schema_migrations (version, description)
VALUES ('20260309040000', 'Protect last active Super Admin at database level')
ON CONFLICT (version) DO NOTHING;

COMMIT;
