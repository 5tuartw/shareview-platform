# Keyword Snapshot Thresholds

## Overview

The keyword snapshot generator creates a **4-quadrant performance matrix** for each retailer/month, providing actionable intelligence for both the CSS provider (Shareight) and retailer clients. This document explains the qualification criteria, quadrant logic, and adaptive limits applied during snapshot generation.

---

## Qualification Criteria

Before any keyword is considered for quadrant analysis, it must meet minimum thresholds to ensure statistical significance:

| Threshold | Value | Rationale |
|-----------|-------|-----------|
| **Minimum Impressions** | `50` | Filters out noise - keywords with <50 impressions over a month are likely insignificant |
| **Minimum Clicks** | `5` | Ensures sufficient click data to calculate meaningful CTR/CVR metrics |

**Impact:**
- Boots Jan 2026: 204,846 total keywords → 326 qualified (0.16%)
- QVC Jan 2026: 236,136 total keywords → 993 qualified (0.42%)

These thresholds are **adaptive** - retailers with lower traffic volumes will have fewer qualified keywords, which is expected and correct.

---

## Quadrant Logic

### 2x2 Performance Matrix: CTR vs Conversions

The quadrant system uses **median CTR** (calculated per retailer/period) as the threshold to segment keywords:

```
                      HIGH CTR (≥ median)          LOW CTR (< median)
                     ┌────────────────────┬────────────────────┐
HAS CONVERSIONS (>0) │  🏆 WINNERS        │  💎 HIDDEN GEMS    │
                     │  (47 Boots)        │  (32 Boots)        │
                     │  (68 QVC)          │  (144 QVC)         │
                     ├────────────────────┼────────────────────┤
NO CONVERSIONS (=0)  │  ⚠️ CSS WINS,      │  ❌ POOR           │
                     │     RETAILER LOSES │     PERFORMERS     │
                     │  (116 Boots)       │  (131 Boots)       │
                     │  (428 QVC)         │  (353 QVC)         │
                     └────────────────────┴────────────────────┘
```

**Why Median CTR?**
- Adaptive to each retailer's baseline performance
- Boots median CTR: 3.90%
- QVC median CTR: 3.34%
- Accounts for industry/product category differences automatically

---

## Quadrant Definitions & Actions

### 🏆 Winners (High CTR + Conversions)
**What it means:** CSS is winning clicks AND retailer site is converting them.

**Examples (Boots):**
- "driclor" - 5.83% CTR, 4.68% CVR, 17.6 conversions
- "electric toothbrush" - 6.5% CTR, 16.22% CVR, 6 conversions

**Actions:**
- **CSS (Shareight):** Scale up - increase bids/budget to get MORE impressions for these golden keywords
- **Retailer:** Protect - maintain competitive pricing, stock availability

**Snapshot Limit:** `150 keywords` (sorted by conversions DESC)
- Rationale: Top 100 converters capture the most valuable opportunities
- If retailer has <100 winners, all are included

---

### ⚠️ CSS Wins, Retailer Loses (High CTR + No Conversions)
**What it means:** Shareight is delivering quality traffic but the retailer's site is failing to convert.

**Examples (Boots):**
- "tcp" - 14.18% CTR, 40 clicks, 0 conversions
- "lactulose syrup" - 4.64% CTR, 45 clicks, 0 conversions
- "morning after pill" - 1.05% CTR, 42 clicks, 0 conversions

**Actions:**
- **CSS (Shareight):** Document for client negotiations - "we're delivering the clicks"
- **Retailer:** **URGENT** - investigate pricing, stock availability, landing page UX, product availability

**Snapshot Limit:** `100 keywords` (sorted by clicks DESC)
- Rationale: Show the biggest wasted click spend (highest volume failures)
- Boots: 116 total → Top 100 shown
- QVC: 428 total → Top 100 shown (highest-impact failures prioritized)

---

### 💎 Hidden Gems (Low CTR + Conversions)
**What it means:** Once clicked, the retailer converts well - but CSS ads aren't getting enough clicks.

**Examples (Boots):**
- "night nurse" - 3.72% CTR, 3.23% CVR, **44 conversions** (best converter!)
- "lovima pill" - 2.02% CTR, 29.41% CVR, 5 conversions
- "sensodyne clinical repair" - 1.54% CTR, 5.80% CVR, 4 conversions

**Actions:**
- **CSS (Shareight):** **OPPORTUNITY** - improve ad copy/relevance, increase bids to get more clicks
- **Retailer:** Once clicked, their site performs well - just need more traffic

**Snapshot Limit:** `150 keywords` (sorted by conversions DESC)
- Rationale: These are proven converters with growth potential
- Boots: 32 total → All 32 included
- QVC: 144 total → All 144 included

---

### ❌ Poor Performers (Low CTR + No Conversions)
**What it means:** Both CSS and retailer are failing. Wasting impressions and clicks.

**Examples (Boots):**
- "constipation medicine" - 2.63% CTR, 27 clicks, 0 conversions
- "blood pressure monitor" - 2.52% CTR, 25 clicks, 0 conversions

**Actions:**
- **Both:** Review and consider pausing/excluding these keywords
- May indicate wrong product match, competitive pricing issues, or irrelevant search intent

**Snapshot Limit:** `100 keywords` (sorted by clicks DESC)
- Rationale: Show the biggest wasteful spend (highest-volume poor performers)
- Boots: 131 total → Top 100 shown
- QVC: 353 total → Top 100 shown

---

## Adaptive Limits - Why Not All Keywords?

### Problem: UI Overload
Showing ALL qualified keywords would overwhelm the client portal:
- QVC has **428 keywords** where CSS wins but retailer loses
- Showing all 428 in a table is not actionable

### Solution: Prioritized Limits
Each quadrant has a **maximum limit** but shows **all qualifying keywords** if count is below the limit:

| Quadrant | Limit | Boots Jan (Actual) | QVC Jan (Actual) | Sort Order |
|----------|-------|-------------------|------------------|------------|
| Winners | 150 | 47 (all shown) | 68 (all shown) | Conversions DESC |
| CSS Wins, Retailer Loses | 100 | **116 → 100 shown** | **428 → 100 shown** | Clicks DESC |
| Hidden Gems | 150 | 32 (all shown) | 144 (all shown) | Conversions DESC |
| Poor Performers | 100 | **131 → 100 shown** | **353 → 100 shown** | Clicks DESC |

### Benefits
- **Small retailers** (Boots): See ALL actionable keywords
- **Large retailers** (QVC): See TOP opportunities prioritized by impact
- **Consistent methodology** but adaptive scale
- **Performance:** Limits prevent massive JSON payloads that slow API/UI

---

## JSONB Structure

The snapshot stores quadrants in `keywords_snapshots.top_keywords` as:

```json
{
  "winners": [
    {
      "search_term": "driclor",
      "impressions": 6444,
      "clicks": 376,
      "conversions": 17.60,
      "ctr": 5.83,
      "cvr": 4.68
    },
    ...
  ],
  "css_wins_retailer_loses": [
    {
      "search_term": "tcp",
      "impressions": 282,
      "clicks": 40,
      "conversions": 0.00,
      "ctr": 14.18,
      "cvr": 0.00
    },
    ...
  ],
  "hidden_gems": [...],
  "poor_performers": [...],
  "median_ctr": 3.90,
  "qualification": {
    "min_impressions": 50,
    "min_clicks": 5
  }
}
```

---

## Adjusting Thresholds

### Code Location
`services/snapshot-generator/generate-snapshots.ts`

```typescript
const KEYWORD_THRESHOLDS = {
  MIN_IMPRESSIONS: 50,
  MIN_CLICKS: 5,

  LOW_VOLUME_TRIGGER_QUALIFIED_COUNT: 30,
  LOW_VOLUME_TRIGGER_POSITIVE_COUNT: 20,
  LOW_VOLUME_MIN_IMPRESSIONS: 30,
  LOW_VOLUME_MIN_CLICKS: 3,

  LIMIT_WINNERS: 150,
  LIMIT_CSS_WINS_RETAILER_LOSES: 100,
  LIMIT_HIDDEN_GEMS: 150,
  LIMIT_POOR_PERFORMERS: 100,
} as const;
```

### Low-Volume Fallback

If a retailer has fewer than `30` qualified terms OR fewer than `20` positive terms
(keywords with conversions) using the default `50/5` filter, the generator
automatically retries qualification at `30/3` for that retailer/month.

This keeps high-volume behaviour stable while improving low-volume positive quadrant coverage.

### Considerations Before Changing

**Increasing MIN_IMPRESSIONS/MIN_CLICKS:**
- ✅ Reduces noise, improves statistical confidence
- ❌ May exclude valuable low-volume keywords for smaller retailers
- **Recommendation:** Only increase if you're seeing too much noise in current data

**Decreasing MIN_IMPRESSIONS/MIN_CLICKS:**
- ✅ Includes more keywords, better coverage
- ❌ May include statistically insignificant keywords (CTR/CVR unreliable)
- **Recommendation:** Only decrease if smaller retailers have too few qualified keywords

**Increasing Quadrant Limits (e.g. 150→200, 100→150):**
- ✅ More comprehensive data for large retailers
- ❌ Larger JSON payloads, slower API responses, UI pagination needed
- **Recommendation:** Monitor API response times and UI performance

**Decreasing Quadrant Limits (100→50, 50→25):**
- ✅ Faster API, smaller snapshots, more focused insights
- ❌ May miss valuable opportunities in larger keyword sets
- **Recommendation:** Only if current limits cause performance issues

---

## Testing Changes

### 1. Dry-Run Preview (Recommended First Step)
```bash
npm run snapshots:dry-run -- --retailer boots --month 2026-01
```

This will show detailed preview output including:
- Total keywords, impressions, clicks, conversions
- Overall CTR and CVR
- Qualified keyword count (after applying MIN_IMPRESSIONS/MIN_CLICKS filters)
- Median CTR threshold (adaptive per retailer)
- Count of keywords in each quadrant
- Sample keywords from each quadrant (top 3)

**Example output:**
```
📊 KEYWORDS SNAPSHOT PREVIEW
─────────────────────────────────────────
Total Keywords: 204,846
Total Impressions: 822,915
Total Clicks: 20,549
Total Conversions: 570.55
Overall CTR: 2.50%
Overall CVR: 2.78%

📈 QUALIFICATION (≥50 impressions, ≥5 clicks)
─────────────────────────────────────────
Qualified Keywords: 326
Median CTR Threshold: 3.90%

🎯 QUADRANT ANALYSIS (2x2 Matrix)
─────────────────────────────────────────

🏆 WINNERS (High CTR + Conversions)
   Count: 47 (storing up to 100)
   • "driclor" - 17.6 conv, 5.83% CTR, 4.68% CVR
   • "night nurse liquid" - 12 conv, 5.06% CTR, 2.59% CVR
   • "orajel extra strength" - 8 conv, 5.42% CTR, 4.35% CVR

⚠️  CSS WINS, RETAILER LOSES (High CTR + No Conversions)
   Count: 116 (storing up to 50)
   • "lactulose syrup" - 45 clicks, 4.64% CTR, 0 conversions
   • "tcp" - 40 clicks, 14.18% CTR, 0 conversions
   • "no7 good intent" - 36 clicks, 8.76% CTR, 0 conversions
```

### 2. Regenerate Snapshots (Live)
```bash
npm run snapshots:generate -- --retailer boots --month 2026-01
```

This will actually write to the ShareView database.

### 3. Verify JSONB Structure
```sql
SELECT 
  retailer_id,
  range_start,
  jsonb_array_length(top_keywords->'winners') as winner_count,
  jsonb_array_length(top_keywords->'css_wins_retailer_loses') as css_wins_count,
  jsonb_array_length(top_keywords->'hidden_gems') as hidden_gems_count,
  jsonb_array_length(top_keywords->'poor_performers') as poor_performers_count,
  top_keywords->>'median_ctr' as median_ctr
FROM keywords_snapshots
WHERE retailer_id = 'boots' 
  AND range_start = '2026-01-01';
```

### 4. Test Client Portal
Visit `http://localhost:3000/retailer/boots/search-terms` and verify:
- Keywords load correctly in performance table
- Quadrant data appears in insights/market insights tabs
- No performance degradation

---

## Analysis Summary

**From Boots Jan 2026 Data:**

| Metric | Value | Insight |
|--------|-------|---------|
| Total keywords | 204,846 | Extreme long tail |
| With any clicks | 10,844 (5.3%) | 95% pure noise |
| Qualified (50+ imp, 5+ clicks) | 326 (0.16%) | Focus on this tiny fraction |
| With conversions | 440 (0.21%) | Only these matter for revenue |
| Median CTR (qualified) | 3.90% | Retailer-specific baseline |
| Median conversions | 0.00 | 99%+ keywords never convert |
| Top keyword | "night nurse" - 44 conversions | 10x better than #2 |

**Key Takeaway:** The long tail is EXTREME. Only ~0.2% of keywords are actionable. The qualification thresholds and adaptive limits ensure we capture the signal and discard the noise.

---

## Change Log

| Date | Author | Change | Rationale |
|------|--------|--------|-----------|
| 2026-02-17 | Initial | Set MIN_IMPRESSIONS=50, MIN_CLICKS=5 | Based on Boots/QVC Jan 2026 analysis |
| 2026-02-17 | Initial | Set quadrant limits: 100/50/100/50 | Balance coverage with performance |
