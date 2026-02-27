# Data Source Inspection Summary
**Date**: February 26, 2026  
**Source**: SSH tunnel on port 18007 → acc_mgmt database  

---

## Executive Summary

Both **category** and **auction** data sources have been inspected and are **ready for integration** into the ShareView Platform snapshot and metrics generators.

---

## 1. Category Data Quality Assessment ✅

### Current Status: **EXCELLENT** 

| Metric | Feb 2026 (BAD) | Current (Feb 26) | Target | Status |
|--------|----------------|------------------|--------|--------|
| **Level-1 categories** | 151 | **19** | ~20 | ✅ GOOD |
| **Hierarchical structure** | 5% | **94.7%** | >90% | ✅ EXCELLENT |
| **Unique paths** | 178 | **606** | Many | ✅ EXCELLENT |
| **Data duration** | - | **78 days** (Dec 11 - Feb 26) | - | ✅ GOOD |

### Key Findings

**✅ Data Quality Restored:**
- November 2025 regression has been **completely resolved**
- Proper Google Product Taxonomy categories present (18 of 20 expected)
- Only 1 flat category found (empty string with 10,827 impressions from catchallredirect campaign)

**Category Structure:**
```
Top categories by impressions (last 30 days):
• Health & Beauty: 841,219 impressions (has children) ✅
• Baby & Toddler: 58,519 impressions (has children) ✅
• Home & Garden: 23,646 impressions (has children) ✅
• Clothing & Accessories: 16,386 impressions (has children) ✅
• (empty string): 10,827 impressions (flat) ⚠️
```

**Found Google Product Taxonomy Categories (18/20):**
- Health & Beauty
- Baby & Toddler
- Home & Garden
- Clothing & Accessories
- Toys & Games
- Food, Beverages & Tobacco
- Cameras & Optics
- Business & Industrial
- Hardware
- Electronics
- Arts & Entertainment
- Furniture
- Sporting Goods
- Luggage & Bags
- Animals & Pet Supplies
- Media
- Office Supplies
- Vehicles & Parts

**Missing (2):** Mature, Software

### Integration Readiness: ✅ READY

**Recommendation:** Proceed with category snapshot integration immediately.

---

## 2. Auction Data Structure Assessment ✅

### Current Status: **READY** (with schema differences)

**Data Availability:**
- Total rows: **214,513**
- Date range: **Jan 2025 - Jan 2026** (13 distinct months)
- Account names: **31 distinct CSS providers** (Octer CSS, Fevuh CSS, etc.)
- Primary account: **Octer CSS** (135,019 rows)

### Schema Mapping

The source schema differs significantly from s8-retailer-analytics:

| s8-retailer-analytics | acc_mgmt Source | Notes |
|-----------------------|-----------------|-------|
| `retailer_id` | `campaign_name` | Extract from pattern: `octer-{retailer}~{type}` |
| `insight_date` | `month` | Monthly granularity (1st of month) |
| `competitor_id` | N/A | Use `shop_display_name` |
| `competitor_name` | `shop_display_name` | Competitor display name |
| `impression_share` | `impr_share` | Percentage value |
| `overlap_rate` | `overlap_rate` | Percentage value |
| `outranking_share` | `outranking_share` | Percentage value (you outranking them) |
| `position_above_rate` | N/A | **NOT AVAILABLE** (them outranking you) |

### Sample Data Structure

**Columns in auction_insights table:**
```
- id (integer, NOT NULL)
- account_name (character varying, NOT NULL)     → CSS provider
- customer_id (character varying, NOT NULL)      → Google Ads customer ID
- campaign_name (character varying, NOT NULL)    → Contains retailer ID
- shop_display_name (character varying, NOT NULL) → Competitor name
- month (date, NOT NULL)                          → Monthly snapshot
- impr_share (numeric, NULL)                      → Can be NULL if < 10%
- outranking_share (numeric, NULL)
- overlap_rate (numeric, NULL)
- fetch_datetime (timestamp, NULL)
- created_at (timestamp, NULL)
- updated_at (timestamp, NULL)
```

**Campaign Name Pattern:**
```
octer-notonthehighstreet~catchall
octer-boots~catchallredirect
octer-nike~brand
^^^^^ ^^^^^^^^^^^^^^^^^ ^^^^
│     │                  │
│     └─ Retailer ID     └─ Campaign type
└─ CSS provider
```

**Sample Record (January 2026, Not On The High Street):**
```
Shop: Amazon.co.uk
Campaign: octer-notonthehighstreet~catchall
Impression Share: 0.5971%
Overlap Rate: 0.6544%
Outranking Share: 0.1306%
```

### Key Differences from s8-retailer-analytics

**1. Retailer Identification:**
- Source uses `campaign_name` with pattern `octer-{retailer}~{type}`
- Need to extract retailer ID from campaign name
- Multiple campaign types per retailer (catchall, brand, etc.)

**2. Data Granularity:**
- Source: **Monthly** snapshots (date = 1st of month)
- s8-retailer-analytics: **Daily** snapshots
- Integration: Treat monthly data as summary for entire month

**3. Missing Fields:**
- ❌ `position_above_rate` (competitor outranking you) - not available
- ❌ `is_shareight` flag - need to identify from data patterns
- ❌ Individual retailer impression share - only competitor shares

**4. NULL Handling:**
- `impr_share` can be NULL (Google shows "< 10%" for low shares)
- Should set `impression_share_is_estimate = true` when NULL

### Integration Requirements

**A. Retailer ID Extraction:**
```typescript
// Extract from campaign_name: "octer-boots~catchallredirect" → "boots"
const retailerId = campaign_name.split('-')[1]?.split('~')[0];
```

**B. Aggregate by Retailer:**
```sql
-- When creating snapshot, aggregate across all campaigns for retailer
SELECT 
  account_name,
  REGEXP_REPLACE(campaign_name, '^[^-]+-([^~]+)~.*$', '\\1') as retailer_id,
  month as snapshot_date,
  shop_display_name as competitor_name,
  AVG(overlap_rate) as avg_overlap_rate,
  AVG(outranking_share) as avg_outranking_share,
  AVG(impr_share) as avg_impression_share
FROM auction_insights
WHERE account_name = 'Octer CSS'
  AND month >= '2026-01-01'
GROUP BY account_name, retailer_id, snapshot_date, competitor_name
```

**C. Calculate Overall Metrics:**
```sql
-- For snapshot summary (per retailer/month):
SELECT
  retailer_id,
  month,
  COUNT(DISTINCT shop_display_name) as total_competitors,
  AVG(overlap_rate) as avg_overlap_rate,
  AVG(outranking_share) as avg_outranking_share,
  
  -- Top competitor (highest overlap)
  (SELECT shop_display_name 
   FROM auction_insights 
   WHERE ... 
   ORDER BY overlap_rate DESC 
   LIMIT 1) as top_competitor_id,
   
  -- Biggest threat (highest overlap + they outrank us)
  -- NOTE: position_above_rate not available, use low outranking_share as proxy
  
  -- Best opportunity (high overlap + we outrank them)
  (SELECT shop_display_name
   FROM auction_insights
   WHERE ...
   ORDER BY overlap_rate * outranking_share DESC
   LIMIT 1) as best_opportunity_id
```

**D. Handle Missing "Your Impression Share":**
The source data only shows **competitor** impression shares, not the retailer's own share. We need to either:
1. Calculate from aggregate data (if available elsewhere)
2. Show "N/A" in UI for this metric
3. Use the overlap/outranking metrics as primary indicators

### Integration Readiness: ✅ READY (with adaptations)

**Recommendation:** Implement auction snapshot generator with the following adaptations:

1. **Extract retailer ID** from campaign_name pattern
2. **Aggregate by month** (not daily like s8-retailer-analytics)
3. **Handle NULL impression shares** with estimate flag
4. **Skip position_above_rate** (not available in source)
5. **Calculate "biggest threat"** using low outranking_share as proxy
6. **Your impression share**: Mark as "Not Available" or calculate separately

---

## 3. Integration Plan

### Phase 1: Category Snapshot Generator ⭐ HIGH PRIORITY

**Status:** ✅ Ready to implement

**Implementation:**
1. Category snapshot generator already exists in `generate-snapshots.ts`
2. Schema already created (`category_performance_snapshots`)
3. Data quality is excellent
4. **Action:** Enable and test existing `generateCategorySnapshot()` function

**Changes Required:**
- Verify snapshot logic handles 606 unique paths efficiently
- Handle empty string category (filter or map to "Uncategorised")

### Phase 2: Auction Snapshot Generator ⭐ MEDIUM PRIORITY

**Status:** ⚠️ Requires schema adaptation

**Implementation:**
1. Create `auction_insights_snapshots` table (if not exists)
2. Implement `generateAuctionSnapshot()` in `generate-snapshots.ts`
3. Create metrics calculator (already exists: `calculators/auctions.ts`)

**Schema for auction_insights_snapshots:**
```sql
CREATE TABLE IF NOT EXISTS auction_insights_snapshots (
  id SERIAL PRIMARY KEY,
  retailer_id VARCHAR(100) NOT NULL,
  range_type VARCHAR(20) NOT NULL DEFAULT 'month',
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  
  -- Aggregate metrics
  avg_impression_share NUMERIC(10,2),  -- May be NULL
  total_competitors INT NOT NULL,
  avg_overlap_rate NUMERIC(10,2) NOT NULL,
  avg_outranking_share NUMERIC(10,2) NOT NULL,
  
  -- Key competitors
  top_competitor_id VARCHAR(255),
  top_competitor_overlap_rate NUMERIC(10,2),
  
  biggest_threat_id VARCHAR(255),
  biggest_threat_overlap_rate NUMERIC(10,2),
  biggest_threat_outranking_you NUMERIC(10,2),
  
  best_opportunity_id VARCHAR(255),
  best_opportunity_overlap_rate NUMERIC(10,2),
  best_opportunity_you_outranking NUMERIC(10,2),
  
  -- Metadata
  last_updated TIMESTAMP DEFAULT NOW(),
  source_account VARCHAR(100),  -- e.g., "Octer CSS"
  
  UNIQUE(retailer_id, range_type, range_start, range_end)
);
```

**Changes Required:**
```typescript
// In generate-snapshots.ts
async function generateAuctionSnapshot(monthData: MonthToProcess) {
  // 1. Extract retailer pattern for campaign matching
  const campaignPattern = `octer-${monthData.retailerId}~%`;
  
  // 2. Query source with retailer extraction
  const result = await source.query(`
    SELECT 
      REGEXP_REPLACE(campaign_name, '^[^-]+-([^~]+)~.*$', '\\1') as retailer_id,
      month,
      shop_display_name,
      impr_share,
      overlap_rate,
      outranking_share
    FROM auction_insights
    WHERE account_name = 'Octer CSS'
      AND campaign_name LIKE $1
      AND month >= $2 AND month <= $3
  `, [campaignPattern, monthData.rangeStart, monthData.rangeEnd]);
  
  // 3. Calculate aggregates
  // 4. Identify top competitor, biggest threat, best opportunity
  // 5. Insert into auction_insights_snapshots
}
```

### Phase 3: Metrics Generator Updates

**Status:** ✅ Calculator already exists

**Changes Required:**
- Update `buildAuctionsMetrics()` to handle NULL impression share
- Adapt to monthly granularity instead of daily
- Test with real snapshot data

### Phase 4: UI Updates (ShareView Client Portal)

**Status:** 🔜 Future work

**Reference Implementation:** [s8-retailer-analytics/retailer-client/components/AuctionContent.tsx](s8-retailer-analytics/retailer-client/components/AuctionContent.tsx)

**Required Components:**
- Overview tab with quick stats
- Competitors table with sorting
- Metric explanations (impression share, overlap rate, etc.)
- Handle NULL impression share display

---

## 4. Risk Assessment

### Category Integration: 🟢 LOW RISK

**Strengths:**
✅ Data quality excellent  
✅ Schema already defined  
✅ Generator already implemented  
✅ Hierarchical structure valid  

**Minor Issues:**
⚠️ One empty string category (10k impressions) - easy to filter  
⚠️ Two missing taxonomy categories (Mature, Software) - not used by retailer  

### Auction Integration: 🟡 MEDIUM RISK

**Strengths:**
✅ Data available and comprehensive  
✅ Calculator already implemented  
✅ 13 months of historical data  

**Challenges:**
⚠️ Schema mismatch requires transformation  
⚠️ Retailer ID extraction from campaign names  
⚠️ Monthly granularity vs daily expectations  
⚠️ Missing "your impression share" metric  
⚠️ Missing "them outranking you" metric  

**Mitigation:**
- Implement robust campaign name parsing
- Handle NULL values gracefully
- Document metric availability differences
- Test with multiple retailers (boots, notonthehighstreet, etc.)

---

## 5. Next Steps

### Immediate (This Week)

1. **✅ DONE:** Inspect category data → Confirmed excellent quality
2. **✅ DONE:** Inspect auction data → Confirmed structure and requirements
3. **🔜 TODO:** Test category snapshot generator with real data
4. **🔜 TODO:** Enable category snapshots in production

### Short Term (1-2 Weeks)

5. **🔜 TODO:** Create auction_insights_snapshots table
6. **🔜 TODO:** Implement generateAuctionSnapshot() function
7. **🔜 TODO:** Test auction snapshot with multiple retailers
8. **🔜 TODO:** Update metrics generator to use new auction snapshots

### Medium Term (3-4 Weeks)

9. **🔜 TODO:** Deploy auction snapshots to production
10. **🔜 TODO:** Build client-facing auction UI components
11. **🔜 TODO:** Test end-to-end flow (snapshot → metrics → UI)

---

## Contact & References

**Generated:** February 26, 2026  
**Database:** acc_mgmt via SSH tunnel (port 18007)  
**Inspection Scripts:**
- `/home/stuart/workspace/github.com/5tuartw/shareview-platform/inspect-category-data.ts`
- `/home/stuart/workspace/github.com/5tuartw/shareview-platform/inspect-auction-data.ts`

**Related Documents:**
- [Category Data Quality Issues](docs/category-data-quality-issues.md) - Historical analysis
- [s8-retailer-analytics AuctionContent](s8-retailer-analytics/retailer-client/components/AuctionContent.tsx) - UI reference
