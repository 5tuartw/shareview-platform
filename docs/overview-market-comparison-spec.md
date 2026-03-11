# Overview Market Comparison Spec

## Scope
Implement a new experience in `Overview > Market Comparison` to benchmark a selected retailer against dynamic cohorts built from market profile domains.

Route context:
- Client dashboard retailer page (`/client/[id]`) Overview tab
- Admin retailer page (`/dashboard/retailer/[id]`) Live Data > Overview

## Goals
1. Show a full-width trend chart for one selected metric.
2. Allow multi-select cohort filters based on profile domains.
3. Show dynamic cohort size as filters change.
4. Support provisional profile tags so staff can use the feature before full confirmation.

## Non-Goals (v1)
1. No predictive forecasting.
2. No per-retailer peer table/ranking list.
3. No saved cohort presets.

## UX Specification

### Controls Row
1. Metric selector (single select):
- `gmv`, `profit`, `impressions`, `clicks`, `ctr`, `conversions`, `cvr`, `roi`
- Default: `gmv`

2. Cohort filters (multi-select chip groups):
- Domain groups come from market profile domains (e.g. category, price positioning, business model, region)
- Users can select multiple values across one or more domains
- Filter logic: `AND` across domains, `OR` within a domain

3. Cohort match indicator:
- Label format: `Matched cohort: N retailers`
- Excludes current retailer from match count
- Show confidence subtitle:
  - `Confirmed only`
  - `Confirmed + provisional`

### Tooltip Copy (filter controls)
For consistency with dashboard filter wording:
- Enrolled: `Show retailers enrolled and being processed`
- Active: `Show all retailers with recent activity`
- All: `Show all retailers with data logged since January 2025`

### Chart Area
1. Full-width line chart:
- Series A: current retailer metric trend
- Series B: cohort median trend
- Optional shaded band: cohort `p25` to `p75` (enabled by default)

2. Time axis:
- Uses existing Overview date window
- Granularity aligns with existing endpoint output (daily preferred)

3. Empty/low sample states:
- `N = 0`: fade chart (reduced opacity), show message and `Clear filters` action
- `N < 5`: show warning badge `Small cohort, interpret with caution`

### Default State
1. Preselect cohort filters from current retailer's profile domains when available.
2. If any selected profile domain is provisional, show `Using provisional profile tags` badge.

## Data Rules
1. Current retailer must be excluded from cohort aggregation.
2. Cohort should include both `confirmed` and `pending_confirmation` by default for operational use.
3. Provide toggle to restrict to `confirmed` only.
4. If a selected cohort dimension has no matches, keep control selected but return `N=0` and empty state.
5. Rate metrics (`ctr`, `cvr`, `roi`) must be computed from source numerators/denominators in the same period windows (avoid averaging pre-aggregated percentages incorrectly).

## API Contract (v1)

### Endpoint
`POST /api/retailer/:retailerId/overview/market-comparison`

### Request
```json
{
  "metric": "gmv",
  "period": {
    "start": "2026-01-01",
    "end": "2026-02-29"
  },
  "granularity": "day",
  "cohort": {
    "include_provisional": true,
    "domains": {
      "primary_category": ["Apparel & Accessories"],
      "price_positioning": ["mid", "premium"],
      "region_focus": ["UK"]
    }
  }
}
```

### Response
```json
{
  "retailer_id": "example-retailer",
  "metric": "gmv",
  "granularity": "day",
  "cohort_summary": {
    "matched_count": 18,
    "confirmed_count": 11,
    "provisional_count": 7,
    "excluded_current_retailer": true,
    "small_sample": false
  },
  "series": {
    "retailer": [
      { "date": "2026-02-01", "value": 1234.56 }
    ],
    "cohort_median": [
      { "date": "2026-02-01", "value": 1102.10 }
    ],
    "cohort_p25": [
      { "date": "2026-02-01", "value": 905.40 }
    ],
    "cohort_p75": [
      { "date": "2026-02-01", "value": 1322.30 }
    ]
  }
}
```

## Backend Notes
1. Cohort candidate set comes from `retailers.profile_domains` + `profile_status`.
2. Metric time series comes from existing Overview metric source (same as current cards/trends).
3. Compute cohort aggregates per date bucket:
- Median: `percentile_cont(0.5)`
- P25/P75: `percentile_cont(0.25/0.75)`
4. Return aligned date buckets for retailer and cohort to simplify chart rendering.

## Frontend Implementation Notes
1. Add Market Comparison panel/component under Overview sub-tab.
2. Reuse existing chart system and date range state.
3. Keep chip state in URL query params where feasible for shareable views.
4. Debounce cohort filter changes (`250-400ms`) before requesting new data.

## Acceptance Criteria
1. Market Comparison shows full-width chart with retailer vs cohort median.
2. User can choose metric and multi-select cohort filters.
3. Matched cohort count updates dynamically when filters change.
4. Zero-match state fades chart and shows recovery action.
5. Small-sample warning appears for `<5` cohort members.
6. Include provisional toggle works and updates counts/series.
7. Current retailer is excluded from cohort counts and aggregates.
8. Response time target: p95 <= 1.5s for 90-day window.

## Rollout Plan
1. Ship behind feature flag: `overview_market_comparison_v1`.
2. Internal validation with staff on 5-10 retailers across different categories.
3. Enable for all staff, then for client view once confidence is high.

## Open Questions
1. Should v1 include benchmark line choices beyond median (mean, p90)?
2. Should domain filter options include only values with >= 1 confirmed retailer?
3. Should we persist last-used cohort filters per user?
