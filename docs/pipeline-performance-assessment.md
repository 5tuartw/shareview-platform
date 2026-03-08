# Pipeline Performance Assessment

Date: 2026-03-08

## Scope
Assess current pipeline and snapshot runtime characteristics, then prioritise optimisation work for scaling to ~200 retailers.

## Recent Benchmarks

### Benchmark Matrix (3 runs, median)
Command:
`npm run benchmark:pipeline-matrix -- --runs=3 --retries=2 --month=2026-02 --output-dir=/tmp`

Result:
- `default`: success=3/3, total=88.7s, snapshots=86.5s, availability=0.3s, metrics=1.8s
- `sequential_domains`: success=3/3, total=122.9s, snapshots=120.7s, availability=0.3s, metrics=1.8s
- `retailer_concurrency_4`: success=3/3, total=49.2s, snapshots=47.1s, availability=0.3s, metrics=1.8s

Interpretation:
- Snapshot generation remains the dominant runtime component.
- Domain parallelism delivers significant gain versus sequential domains (~1.4x faster by median total runtime).
- Increasing snapshot retailer concurrency from default to 4 delivers the largest gain in this matrix (~1.8x faster than default by median total runtime).
- Availability and metrics are not current bottlenecks at this scope.

Decision recommendation:
1. Promote `SNAPSHOT_RETAILER_CONCURRENCY=4` as the operational default for current environment.
1. Keep domain parallelism enabled.
1. Re-run the matrix after category bulk-insert optimisation to reassess headroom before scaling to ~200 retailers.

### Post-Optimisation Smoke Check
Command:
`npm run snapshots:generate -- --retailer=marks-and-spencer --month=2026-02 --force`

Result:
- Retailer concurrency: 4 (default)
- Domain parallelism: enabled
- Month runtime: 4.0s
- Retailer runtime: 4.6s

Interpretation:
- Category bulk-insert plus concurrency default uplift materially reduced single-retailer month runtime versus earlier ~6.5s baseline in this scenario.
- Full matrix rerun is still required before extrapolating to all retailers.

### Benchmark Matrix (3 runs, median) - Post Optimisation
Command:
`npm run benchmark:pipeline-matrix -- --runs=3 --retries=2 --month=2026-02 --output-dir=/tmp`

Report:
`/tmp/pipeline-benchmark-matrix-2026-03-08T10-02-49Z.json`

Result:
- `default`: success=3/3, total=20.8s, snapshots=18.6s, availability=0.3s, metrics=1.9s
- `sequential_domains`: success=3/3, total=28.2s, snapshots=25.9s, availability=0.3s, metrics=1.9s
- `retailer_concurrency_4`: success=3/3, total=19.2s, snapshots=17.0s, availability=0.3s, metrics=1.9s

Before/after delta vs previous matrix (`/tmp/pipeline-benchmark-matrix-2026-03-08T09-51-09Z.json`):
- `default` total: 88.7s -> 20.8s (~76.6% faster)
- `default` snapshots: 86.5s -> 18.6s (~78.5% faster)
- `sequential_domains` total: 122.9s -> 28.2s (~77.1% faster)
- `sequential_domains` snapshots: 120.7s -> 25.9s (~78.5% faster)
- `retailer_concurrency_4` total: 49.2s -> 19.2s (~61.0% faster)
- `retailer_concurrency_4` snapshots: 47.1s -> 17.0s (~63.9% faster)

Notes:
- Improvements align with two implemented changes: category bulk-insert writes and raising default retailer concurrency.
- Since default concurrency changed from 2 to 4 between matrices, future benchmark matrices should include explicit concurrency profiles to preserve apples-to-apples comparisons.

### Snapshot Generation (single retailer/month)
Command A:
`npm run snapshots:generate -- --retailer=marks-and-spencer --month=2026-02 --force`

Result A:
- Domain parallelism: enabled
- Retailer concurrency: 2
- Month runtime: 6.5s
- Retailer runtime: 7.0s
- Snapshots written: 3 (keywords, categories, products)

Command B:
`npm run snapshots:generate -- --retailer=marks-and-spencer --month=2026-02 --force --sequential-domains`

Result B:
- Domain parallelism: disabled
- Retailer concurrency: 2
- Month runtime: 11.7s
- Retailer runtime: 12.2s
- Snapshots written: 3

Observed gain from domain parallelism:
- Runtime reduction: ~44.4% (11.7s -> 6.5s)
- Speedup factor: ~1.8x

### Pipeline Full Run Observation
Command:
`npm run pipeline -- --retailer=marks-and-spencer --month=2026-02 --force --snapshot-sequential-domains`

Observation:
- Snapshot step completed (14.5s)
- Availability step failed due transient analytics DB connection termination
- This indicates infra/transient resilience work is required for reliable end-to-end benchmarking

## Freshness Logic Status
Current month-selection logic now uses any source-domain update (keywords/categories/products) and compares against latest snapshot update across corresponding snapshot tables. This removes the prior keyword-only trigger behaviour.

## Open Risks
- End-to-end benchmark consistency is currently limited by intermittent analytics DB connection drops during availability refresh.
- Category snapshot still performs per-node inserts; this remains a likely bottleneck at higher retailer counts.

## Next Assessment Steps
1. Stabilise benchmark harness
- Add retries or guarded rerun wrapper for full pipeline benchmarking when availability refresh hits transient connection errors.
- Run each benchmark profile 3 times and capture median.

2. Multi-retailer benchmark matrix
- Full month force run across all enabled retailers:
  - Profile P1: default settings
  - Profile P2: sequential domains
  - Profile P3: higher retailer concurrency (e.g. 4)
- Capture stage timings and throughput from pipeline output.

3. Bottleneck remediation benchmark
- Implement category snapshot bulk insert path.
- Re-run P1/P2 profiles and compare category-heavy retailer runtimes.

4. Scale readiness decision gate
- If projected runtime at 200 retailers remains above target after TS optimisations, proceed with hybrid worker path for heavy transforms.

## Reporting Format for Future Runs
For each run, capture:
- command
- total runtime
- per-stage runtime (snapshots, availability, metrics)
- snapshots written/skipped
- failures/retries
- environment flags (concurrency, domain parallel, force/month)
