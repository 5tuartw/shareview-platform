# Release Note - 2026-03-11 - Overview Monthly Parity

## Summary
Completed monthly parity hardening for Overview and Market Comparison in the client portal.

## Included
- Shared deterministic monthly SQL contract used by both overview and cohort monthly queries.
- Monthly dedupe based on latest source row precedence (fetch_run_id, timestamps, id).
- New automated parity test script:
  - `npm run test:overview-monthly-contract`
- Market Comparison no-data UX improvements:
  - Missing monthly points remain gaps.
  - Tooltip displays `No data` for missing values.
  - Monthly gap explainer message added.
- Validation evidence document:
  - `docs/overview-monthly-validation-2026-03-11.md`

## Validation
- Type-check: pass
- Monthly parity test: pass
- Live SQL parity checks (sparse, dense, M&S): pass

## Notes
Repository-wide lint still has pre-existing debt in unrelated files; changed files for this slice are clean under targeted lint checks.
