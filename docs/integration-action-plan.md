# Integration Action Plan: Categories & Auctions
**Date**: February 26, 2026  
**Priority**: Categories (HIGH), Auctions (MEDIUM)

---

## Summary

✅ **Categories:** Data quality EXCELLENT (94.7% hierarchical) - Ready for immediate integration  
⚠️ **Auctions:** Data available but requires schema transformations - Ready with adaptations

---

## Quick Start: Test Category Snapshots

The category snapshot generator already exists. Test it now:

```bash
cd /home/stuart/workspace/github.com/5tuartw/shareview-platform

# Dry run to preview what would be generated
npm run snapshots:dry-run -- --retailer=boots --month=2026-01

# If output looks good, generate real snapshot
npm run snapshots:generate -- --retailer=boots --month=2026-01

# Verify snapshot was created
npx tsx -e "
import { query } from './lib/db';
const result = await query('SELECT * FROM category_performance_snapshots WHERE retailer_id = \\'boots\\' ORDER BY range_start DESC LIMIT 10');
console.log(\`Found \${result.rows.length} category snapshots\`);
console.log(result.rows);
process.exit(0);
"
```

---

## Phase 1: Enable Category Snapshots ⭐

**Estimated Time:** 2-3 hours  
**Risk:** 🟢 LOW

### Tasks

#### 1.1 Test Existing Generator
```bash
# Test with dry-run for boots
npm run snapshots:dry-run -- --retailer=boots --month=2026-01
```

**Expected Output:**
- Should show 606 unique category paths
- Should calculate node + branch metrics
- Should handle empty string category

**✅ Success Criteria:**
- No errors during dry-run
- Metrics look reasonable (impressions, clicks, CTR, CVR)
- Branch metrics > node metrics (due to aggregation)

#### 1.2 Handle Empty Category

Check if empty string category causes issues:

```typescript
// In generate-snapshots.ts, in generateCategorySnapshot()
// Around line 710, add filter:

// Build initial nodes with node metrics
for (const row of nodeMetricsResult.rows) {
  const l1 = row.category_level1 || '';
  
  // Skip empty categories
  if (!l1.trim()) continue;  // <-- ADD THIS LINE
  
  const l2 = row.category_level2 || '';
  // ... rest of code
}
```

#### 1.3 Generate Production Snapshots

```bash
# Generate for all enabled retailers
npm run snapshots:generate

# Or specific retailer
npm run snapshots:generate -- --retailer=boots
```

#### 1.4 Update Metrics Generator

```bash
# Ensure metrics generator picks up category snapshots
npm run metrics:generate -- --retailer=boots --month=2026-01
```

**Verify Output:**
```bash
npx tsx -e "
import { query } from './lib/db';
const metrics = await query(\`
  SELECT component_type, COUNT(*) 
  FROM domain_metrics 
  WHERE retailer_id = 'boots' 
    AND page_type = 'categories'
  GROUP BY component_type
\`);
console.log('Category metrics generated:');
console.table(metrics.rows);
process.exit(0);
"
```

### Completion Checklist

- [ ] Dry-run successful for boots
- [ ] Empty category handled (filtered or mapped)
- [ ] Snapshot generated successfully
- [ ] Metrics calculated from snapshot
- [ ] Verified in database (606 category paths)
- [ ] No performance issues (< 5 seconds to generate)

---

## Phase 2: Implement Auction Snapshots ⚠️

**Estimated Time:** 6-8 hours  
**Risk:** 🟡 MEDIUM (schema transformation required)

### Tasks

#### 2.1 Create Database Schema

Create migration file: `migrations/YYYYMMDD_create_auction_insights_snapshots.sql`

```sql
-- Migration: Create auction_insights_snapshots table
-- Purpose: Store monthly auction insights aggregations per retailer

CREATE TABLE IF NOT EXISTS auction_insights_snapshots (
  id SERIAL PRIMARY KEY,
  retailer_id VARCHAR(100) NOT NULL,
  range_type VARCHAR(20) NOT NULL DEFAULT 'month',
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  
  -- Aggregate metrics
  avg_impression_share NUMERIC(10,2),  -- Can be NULL if not available
  total_competitors INT NOT NULL,
  avg_overlap_rate NUMERIC(10,2) NOT NULL,
  avg_outranking_share NUMERIC(10,2) NOT NULL,
  
  -- Top competitors
  top_competitor_id VARCHAR(255),
  top_competitor_overlap_rate NUMERIC(10,2),
  
  biggest_threat_id VARCHAR(255),
  biggest_threat_overlap_rate NUMERIC(10,2),
  biggest_threat_low_outranking NUMERIC(10,2),  -- proxy for "them outranking us"
  
  best_opportunity_id VARCHAR(255),
  best_opportunity_overlap_rate NUMERIC(10,2),
  best_opportunity_you_outranking NUMERIC(10,2),
  
  -- Metadata
  last_updated TIMESTAMP DEFAULT NOW(),
  source_account VARCHAR(100) DEFAULT 'Octer CSS',
  
  UNIQUE(retailer_id, range_type, range_start, range_end)
);

CREATE INDEX idx_auction_snapshots_retailer_date 
  ON auction_insights_snapshots(retailer_id, range_start);

-- Add to retailer_metadata to enable auction snapshots
ALTER TABLE retailer_metadata 
  ADD COLUMN IF NOT EXISTS auction_snapshot_enabled BOOLEAN DEFAULT false;

UPDATE retailer_metadata 
SET auction_snapshot_enabled = true 
WHERE retailer_id IN ('boots', 'notonthehighstreet');  -- Add retailers as needed
```

Run migration:
```bash
# Using your existing migration system
psql -h 127.0.0.1 -p 5437 -U sv_user -d shareview \
  < migrations/YYYYMMDD_create_auction_insights_snapshots.sql
```

#### 2.2 Implement Generator Function

Add to `services/snapshot-generator/generate-snapshots.ts`:

```typescript
/**
 * Generate auction insights snapshot for a given month
 * 
 * Source: auction_insights table (acc_mgmt database)
 * Schema differences:
 * - Uses campaign_name pattern: "octer-{retailer}~{type}"
 * - Monthly granularity (not daily)
 * - Competitor impression share only (not yours)
 */
async function generateAuctionSnapshot(monthData: MonthToProcess): Promise<SnapshotResult> {
  const source = getSourcePool();
  const target = getTargetPool();
  const { retailerId, rangeStart, rangeEnd } = monthData;

  // Build campaign pattern to match retailer
  const campaignPattern = `octer-${retailerId}~%`;

  // Step 1: Query source data with retailer extraction
  const sourceResult = await source.query(`
    SELECT 
      campaign_name,
      shop_display_name as competitor_name,
      impr_share as competitor_impression_share,
      overlap_rate,
      outranking_share as you_outranking
    FROM auction_insights
    WHERE account_name = 'Octer CSS'
      AND campaign_name LIKE $1
      AND month >= $2 
      AND month < $3 + INTERVAL '1 month'
  `, [campaignPattern, rangeStart, rangeStart]);

  if (sourceResult.rows.length === 0) {
    return {
      domain: 'auctions',
      retailerId,
      month: rangeStart.slice(0, 7),
      rowCount: 0,
      operation: 'skipped',
    };
  }

  // Step 2: Calculate aggregates per competitor
  interface CompetitorMetrics {
    competitor_name: string;
    avg_overlap_rate: number;
    avg_you_outranking: number;
    avg_competitor_impression_share: number | null;
    records_count: number;
  }

  const competitorMap = new Map<string, CompetitorMetrics>();

  for (const row of sourceResult.rows) {
    const name = row.competitor_name;
    
    if (!competitorMap.has(name)) {
      competitorMap.set(name, {
        competitor_name: name,
        avg_overlap_rate: 0,
        avg_you_outranking: 0,
        avg_competitor_impression_share: null,
        records_count: 0,
      });
    }

    const metrics = competitorMap.get(name)!;
    metrics.avg_overlap_rate += Number(row.overlap_rate) || 0;
    metrics.avg_you_outranking += Number(row.you_outranking) || 0;
    
    if (row.competitor_impression_share !== null) {
      const current = metrics.avg_competitor_impression_share || 0;
      metrics.avg_competitor_impression_share = current + Number(row.competitor_impression_share);
    }
    
    metrics.records_count += 1;
  }

  // Calculate averages
  const competitors = Array.from(competitorMap.values()).map(c => ({
    ...c,
    avg_overlap_rate: c.avg_overlap_rate / c.records_count,
    avg_you_outranking: c.avg_you_outranking / c.records_count,
    avg_competitor_impression_share: 
      c.avg_competitor_impression_share !== null 
        ? c.avg_competitor_impression_share / c.records_count 
        : null,
  }));

  // Step 3: Calculate snapshot aggregates
  const total_competitors = competitors.length;
  const avg_overlap_rate = competitors.reduce((sum, c) => sum + c.avg_overlap_rate, 0) / total_competitors;
  const avg_outranking_share = competitors.reduce((sum, c) => sum + c.avg_you_outranking, 0) / total_competitors;
  
  // Average impression share (may be null if no data)
  const competitorsWithShare = competitors.filter(c => c.avg_competitor_impression_share !== null);
  const avg_impression_share = competitorsWithShare.length > 0
    ? competitorsWithShare.reduce((sum, c) => sum + c.avg_competitor_impression_share!, 0) / competitorsWithShare.length
    : null;

  // Step 4: Identify key competitors
  
  // Top competitor: Highest overlap rate
  const topCompetitor = competitors.reduce((max, c) => 
    c.avg_overlap_rate > max.avg_overlap_rate ? c : max
  );

  // Biggest threat: High overlap + low outranking (they likely outrank us)
  const biggestThreat = competitors.reduce((threat, c) => {
    const threatScore = c.avg_overlap_rate * (100 - c.avg_you_outranking);
    const currentScore = threat.avg_overlap_rate * (100 - threat.avg_you_outranking);
    return threatScore > currentScore ? c : threat;
  });

  // Best opportunity: High overlap + high outranking (we outrank them)
  const bestOpportunity = competitors.reduce((opp, c) => {
    const oppScore = c.avg_overlap_rate * c.avg_you_outranking;
    const currentScore = opp.avg_overlap_rate * opp.avg_you_outranking;
    return oppScore > currentScore ? c : opp;
  });

  // Step 5: Upsert snapshot
  const upsertResult = await target.query(`
    INSERT INTO auction_insights_snapshots (
      retailer_id,
      range_type,
      range_start,
      range_end,
      avg_impression_share,
      total_competitors,
      avg_overlap_rate,
      avg_outranking_share,
      top_competitor_id,
      top_competitor_overlap_rate,
      biggest_threat_id,
      biggest_threat_overlap_rate,
      biggest_threat_low_outranking,
      best_opportunity_id,
      best_opportunity_overlap_rate,
      best_opportunity_you_outranking
    ) VALUES (
      $1, 'month', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    )
    ON CONFLICT (retailer_id, range_type, range_start, range_end)
    DO UPDATE SET
      avg_impression_share = EXCLUDED.avg_impression_share,
      total_competitors = EXCLUDED.total_competitors,
      avg_overlap_rate = EXCLUDED.avg_overlap_rate,
      avg_outranking_share = EXCLUDED.avg_outranking_share,
      top_competitor_id = EXCLUDED.top_competitor_id,
      top_competitor_overlap_rate = EXCLUDED.top_competitor_overlap_rate,
      biggest_threat_id = EXCLUDED.biggest_threat_id,
      biggest_threat_overlap_rate = EXCLUDED.biggest_threat_overlap_rate,
      biggest_threat_low_outranking = EXCLUDED.biggest_threat_low_outranking,
      best_opportunity_id = EXCLUDED.best_opportunity_id,
      best_opportunity_overlap_rate = EXCLUDED.best_opportunity_overlap_rate,
      best_opportunity_you_outranking = EXCLUDED.best_opportunity_you_outranking,
      last_updated = NOW()
    RETURNING (xmax = 0) AS inserted
  `, [
    retailerId,
    rangeStart,
    rangeEnd,
    avg_impression_share,
    total_competitors,
    avg_overlap_rate,
    avg_outranking_share,
    topCompetitor.competitor_name,
    topCompetitor.avg_overlap_rate,
    biggestThreat.competitor_name,
    biggestThreat.avg_overlap_rate,
    100 - biggestThreat.avg_you_outranking,  // Low outranking = they outrank us
    bestOpportunity.competitor_name,
    bestOpportunity.avg_overlap_rate,
    bestOpportunity.avg_you_outranking,
  ]);

  const inserted = upsertResult.rows[0]?.inserted === true;

  return {
    domain: 'auctions',
    retailerId,
    month: rangeStart.slice(0, 7),
    rowCount: total_competitors,
    operation: inserted ? 'created' : 'updated',
  };
}
```

#### 2.3 Enable in Main Generator

In `generateSnapshots()` function, add auction snapshot call:

```typescript
// Around line 1230, add:
const auctionResult = await generateAuctionSnapshot(monthData);
results.push(auctionResult);

console.log(`      Auctions: ${auctionResult.operation} (${auctionResult.rowCount} competitors)`);
```

And update the retailer check to include auction enablement:

```typescript
// Around line 170
const enabledResult = await query<RetailerConfig>(`
  SELECT 
    retailer_id,
    retailer_name,
    snapshot_enabled,
    auction_snapshot_enabled  -- Add this
  FROM retailer_metadata
  WHERE snapshot_enabled = true
`);
```

#### 2.4 Test Auction Generator

```bash
# Dry-run test (add dry-run support for auctions first)
npm run snapshots:dry-run -- --retailer=boots --month=2026-01

# Generate actual snapshot
npm run snapshots:generate -- --retailer=boots --month=2026-01

# Verify
npx tsx -e "
import { query } from './lib/db';
const result = await query(\`
  SELECT * 
  FROM auction_insights_snapshots 
  WHERE retailer_id = 'boots'
  ORDER BY range_start DESC
  LIMIT 5
\`);
console.log('Auction snapshots:');
console.table(result.rows);
process.exit(0);
"
```

### Completion Checklist

- [ ] Migration created and run
- [ ] `generateAuctionSnapshot()` implemented
- [ ] Enabled in main generator
- [ ] Tested with boots retailer
- [ ] Verified snapshot created successfully
- [ ] Metrics look reasonable (10-50 competitors, overlap 0-100%)
- [ ] Top competitor identified
- [ ] Biggest threat identified
- [ ] Best opportunity identified

---

## Phase 3: Update Metrics Generator

**Estimated Time:** 2-3 hours  
**Risk:** 🟢 LOW (calculator already exists)

### Tasks

#### 3.1 Update Snapshot Loader

In `services/domain-metrics-generator/generate-domain-metrics.ts`:

```typescript
// Around line 130, add auction snapshot loading
const auctionResult = await query<AuctionSnapshot>(`
  SELECT *
  FROM auction_insights_snapshots
  WHERE retailer_id = $1
    AND range_type = 'month'
    AND range_start = $2
    AND range_end = $3
`, [period.retailerId, period.periodStart, period.periodEnd]);

const auctionSnapshot = auctionResult.rows[0] || null;
```

#### 3.2 Call Existing Calculator

```typescript
// Around line 200
const auctionCalc = buildAuctionsMetrics(
  auctionSnapshot,
  period.periodStart,
  period.periodEnd
);

metricsToInsert.push(...auctionCalc.metrics);
errors.push(...auctionCalc.errors);
```

#### 3.3 Test Metrics Generation

```bash
npm run metrics:generate -- --retailer=boots --month=2026-01
```

### Completion Checklist

- [ ] Snapshot loader updated
- [ ] Calculator called
- [ ] Metrics generated successfully
- [ ] Verified: page_headline, quick_stats, contextual_info components created
- [ ] No errors in metrics generation

---

## Testing Checklist

### Categories
- [ ] Snapshot generates in < 5 seconds
- [ ] 606 category paths created
- [ ] Branch metrics > node metrics
- [ ] Empty category handled
- [ ] Metrics calculator runs
- [ ] domain_metrics populated

### Auctions  
- [ ] Campaign names parsed correctly
- [ ] Retailer ID extracted properly
- [ ] Competitors aggregated correctly
- [ ] NULL impression shares handled
- [ ] Top competitors identified
- [ ] Metrics calculated
- [ ] domain_metrics populated

---

## Rollback Plan

If issues occur:

### Categories
```sql
-- Remove bad snapshots
DELETE FROM category_performance_snapshots 
WHERE retailer_id = 'boots' AND range_start >= '2026-01-01';

-- Remove bad metrics
DELETE FROM domain_metrics 
WHERE retailer_id = 'boots' AND page_type = 'categories' AND period_start >= '2026-01-01';
```

### Auctions
```sql
-- Remove snapshots
DELETE FROM auction_insights_snapshots 
WHERE retailer_id = 'boots' AND range_start >= '2026-01-01';

-- Remove metrics
DELETE FROM domain_metrics 
WHERE retailer_id = 'boots' AND page_type = 'auctions' AND period_start >= '2026-01-01';
```

---

## Success Metrics

**Categories:**
- ✅ Snapshot generation successful
- ✅ 600+ category paths loaded
- ✅ Metrics calculated
- ✅ Performance < 5s per month

**Auctions:**
- ✅ Snapshot generation successful
- ✅ 10-50 competitors per retailer
- ✅ Metrics calculated
- ✅ Top/threat/opportunity identified correctly

---

**Document Generated:** February 26, 2026  
**Next Review:** After Phase 1 completion
