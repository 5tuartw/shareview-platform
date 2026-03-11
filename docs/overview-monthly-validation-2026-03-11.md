# Overview Monthly Validation - 2026-03-11

## Scope
Validation pass for monthly parity after shared overview monthly SQL contract rollout.

Covered areas:
- Multi-retailer period parity between overview monthly extraction and market comparison monthly extraction.
- Sparse-month and dense-month retailer behaviour.
- Marks & Spencer mapping verification from shareview to analytics source ID.

## Retailers Checked
- Marks & Spencer: shareview retailer_id `marks-and-spencer` -> source_retailer_id `1402`
- Sparse sample retailer: `1011l6178` (4 monthly points)
- Dense sample retailer: `1011l6377` (13 monthly points)

## SQL Validation Results
Parity query output:

| retailer_id | overview_points | cohort_points | missing_in_cohort |
| --- | ---: | ---: | ---: |
| 1011l6178 | 4 | 4 | 0 |
| 1011l6377 | 13 | 13 | 0 |
| 1402 | 9 | 9 | 0 |

Result: PASS. For all three representative retailers, the market comparison monthly extraction returns the same period set as overview monthly extraction.

## Additional Automated Check
- `npm run -s test:overview-monthly-contract`
- Result: PASS

## Conclusion
Monthly parity is validated for:
- one sparse retailer,
- one dense retailer,
- and the known reference retailer (Marks & Spencer).

The shared SQL contract is behaving as intended for live data as of 2026-03-11.
