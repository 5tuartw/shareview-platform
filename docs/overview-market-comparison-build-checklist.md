# Overview Market Comparison Build Checklist

This checklist translates `docs/overview-market-comparison-spec.md` into implementation tasks.

## 1) Backend Tasks

### 1.1 Endpoint Scaffolding
- [ ] Add route: `POST /api/retailer/[id]/overview/market-comparison`
- [ ] Validate request body:
  - `metric` in allowed list (`gmv`, `profit`, `impressions`, `clicks`, `ctr`, `conversions`, `cvr`, `roi`)
  - `period.start`, `period.end` valid ISO dates
  - `granularity` currently `day` only (return 400 for unsupported)
  - `cohort.include_provisional` boolean
  - `cohort.domains` object with string-array values
- [ ] Return consistent error payload shape `{ error: string }`

### 1.2 Cohort Builder
- [ ] Build candidate retailer set from `retailers.profile_domains`
- [ ] Apply domain filter logic:
  - `OR` within domain values
  - `AND` across domains
- [ ] Exclude current retailer from cohort
- [ ] Respect provisional toggle:
  - `include_provisional=true`: include `pending_confirmation` + `confirmed`
  - `include_provisional=false`: include `confirmed` only
- [ ] Return cohort counts:
  - `matched_count`
  - `confirmed_count`
  - `provisional_count`
  - `small_sample` (`matched_count < 5`)

### 1.3 Metric Series Aggregation
- [ ] Reuse existing Overview metric source tables/logic for trend windows
- [ ] Compute per-date series for current retailer
- [ ] Compute per-date cohort percentiles:
  - `p50` (median)
  - `p25`
  - `p75`
- [ ] Ensure aligned date buckets in response
- [ ] For rate metrics (`ctr`, `cvr`, `roi`), use correct period-level derivation (avoid averaging percentages incorrectly)

### 1.4 Performance and Safety
- [ ] Add guardrail: if date range > 365 days, return 400
- [ ] Add query timeout or safe limit handling
- [ ] Add basic caching key strategy (optional v1.1)
- [ ] Instrument timing logs for p50/p95 route latency

### 1.5 Tests (Backend)
- [ ] Unit test: request validation rejects invalid metric/date/cohort payload
- [ ] Unit test: cohort filter logic (`AND`/`OR`) correctness
- [ ] Unit test: current retailer excluded from cohort
- [ ] Unit test: provisional toggle behaviour
- [ ] Integration test: non-empty series for known retailer/date window
- [ ] Integration test: zero cohort match returns empty cohort series with valid response

## 2) Frontend Tasks

### 2.1 Component Structure
- [ ] Add/extend `Overview > Market Comparison` panel component
- [ ] Add controls row:
  - metric selector
  - cohort multi-select controls
  - provisional toggle (`Confirmed + provisional` / `Confirmed only`)
- [ ] Add dynamic cohort summary strip (`Matched cohort: N retailers`)

### 2.2 Cohort Multi-Select UX
- [ ] Domain groups rendered from profile taxonomy/options
- [ ] Chip selections support remove-by-chip and clear-all
- [ ] Debounce filter updates (`250-400ms`) before fetch
- [ ] Preserve selections in URL query params (recommended)

### 2.3 Chart Rendering
- [ ] Full-width chart container
- [ ] Plot series:
  - retailer line
  - cohort median line
  - p25-p75 band
- [ ] Tooltip values show date + retailer + cohort values
- [ ] Legend labels are clear and consistent

### 2.4 Empty and Low-Sample States
- [ ] If `matched_count=0`, fade chart and show:
  - message: no matching cohort
  - action: `Clear filters`
- [ ] If `matched_count<5`, show warning badge
- [ ] If API error, show retry inline error state

### 2.5 Provisional State Messaging
- [ ] If provisional included and present, show `Using provisional profile tags`
- [ ] If confirmed-only, show `Confirmed profiles only`

### 2.6 Tooltips (Control consistency)
Use exact copy:
- [ ] Enrolled: `Show retailers enrolled and being processed`
- [ ] Active: `Show all retailers with recent activity`
- [ ] All: `Show all retailers with data logged since January 2025`

### 2.7 Tests (Frontend)
- [ ] Unit test: control state updates request payload
- [ ] Unit test: empty state when `matched_count=0`
- [ ] Unit test: low-sample warning when `<5`
- [ ] Integration test: chart updates when metric changes
- [ ] Integration test: chart updates when cohort chips change

## 3) QA Test Plan

### 3.1 Functional Scenarios
- [ ] Default load with no additional cohort selections
- [ ] Select one domain value (e.g. `primary_category=Apparel & Accessories`)
- [ ] Select multi-domain cohort (e.g. category + price + region)
- [ ] Toggle provisional include/exclude and verify count changes
- [ ] Switch metric across all supported options

### 3.2 Edge Cases
- [ ] Zero-match cohort state
- [ ] Single-match cohort state
- [ ] Small cohort (`N<5`) warning state
- [ ] Retailer with provisional profile only
- [ ] Retailer with sparse/no trend data in selected period

### 3.3 Data Integrity Checks
- [ ] Cohort counts exclude current retailer
- [ ] Cohort median visibly stable with known test fixture
- [ ] Rate metrics values match manual SQL spot checks
- [ ] Date buckets align between retailer and cohort series

### 3.4 UX Checks
- [ ] Controls remain usable on narrow desktop widths
- [ ] Loading skeleton/spinner behaves correctly during refetch
- [ ] Clear filters resets chart and count
- [ ] Tooltip copy exactly matches approved text

## 4) Suggested Delivery Phases

### Phase A (MVP)
- Backend endpoint with median only
- Frontend controls + full-width chart
- Dynamic count + zero/low states

### Phase B
- Add p25/p75 band
- URL-state persistence
- Improved loading and caching

### Phase C
- Additional benchmarks (optional): p90, top-decile overlays
- Saved cohort presets

## 5) Ticket Breakdown (Ready To Create)
1. API: Implement market comparison endpoint and validation.
2. API: Cohort builder with profile-domain filtering and provisional toggle.
3. API: Cohort percentile aggregation for daily metric series.
4. UI: Market Comparison controls row (metric + cohort filters + provisional toggle).
5. UI: Full-width chart with retailer line and cohort median.
6. UI: Empty/low-sample states and clear-filters action.
7. QA: End-to-end test pass for cohort filtering and metric switching.
8. Perf: Add latency instrumentation and optimise heavy query paths.

## 6) Definition Of Done
- [ ] All acceptance criteria in `overview-market-comparison-spec.md` pass.
- [ ] Backend + frontend tests added and green.
- [ ] Manual QA run completed with evidence notes/screenshots.
- [ ] Feature behind flag `overview_market_comparison_v1` and documented.
- [ ] Rollout notes added to release/deployment checklist.
