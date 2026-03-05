/**
 * Standalone Auction Snapshot Generator
 *
 * Generates auction_insights_snapshots from auction_insights upload data.
 * Run after uploading auction CSV data via the admin upload page.
 *
 * Unlike the main snapshot generator (snapshot-generator/generate-snapshots.ts),
 * this script ONLY processes auction data and reads solely from the SV DB.
 *
 * Usage:
 *   npx ts-node services/generate-auction-snapshots.ts
 *   npx ts-node services/generate-auction-snapshots.ts --retailer=boots
 *   npx ts-node services/generate-auction-snapshots.ts --month=2026-01
 *   npx ts-node services/generate-auction-snapshots.ts --retailer=boots --month=2026-01
 *   npx ts-node services/generate-auction-snapshots.ts --dry-run
 *   npx ts-node services/generate-auction-snapshots.ts --force
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local before any other imports that might touch env vars
config({ path: resolve(process.cwd(), '.env.local') });

import { Pool, PoolClient } from 'pg';

// ============================================================================
// Configuration
// ============================================================================

const SV_DB_CONFIG = {
  host: process.env.SV_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER || process.env.SV_DBUSER || 'sv_user',
  password: process.env.SV_DB_PASS || process.env.SV_DBPASSWORD,
  database: process.env.SV_DB_NAME || process.env.SV_DBNAME || 'shareview',
};

// ============================================================================
// Types
// ============================================================================

interface SnapshotResult {
  retailerId: string;
  month: string;
  operation: 'created' | 'updated' | 'skipped' | 'error';
  rowCount: number;
  error?: string;
}

interface ScriptOptions {
  retailer?: string;
  month?: string;   // YYYY-MM
  dryRun: boolean;
  force: boolean;
}

// ============================================================================
// Core Snapshot Logic
// ============================================================================

/**
 * Generate (or regenerate) an auction insights snapshot for one retailer/month pair.
 * All data comes from auction_insights in the SV DB.
 */
async function generateAuctionSnapshot(
  client: PoolClient,
  retailerId: string,
  monthDate: string,  // YYYY-MM-01
  rangeStart: string, // YYYY-MM-01
  rangeEnd: string,   // YYYY-MM-28/30/31
  dryRun: boolean,
): Promise<SnapshotResult> {
  const month = monthDate.slice(0, 7); // YYYY-MM

  // Step 1: Check competitor rows exist.
  const checkResult = await client.query<{ row_count: string }>(`
    SELECT COUNT(*)::int AS row_count
    FROM auction_insights
    WHERE retailer_id = $1
      AND month = $2
      AND preferred_for_display = true
      AND NOT is_self
  `, [retailerId, monthDate]);

  const rowCount = Number(checkResult.rows[0]?.row_count ?? 0);

  if (rowCount === 0) {
    return { retailerId, month, operation: 'skipped', rowCount: 0 };
  }

  if (dryRun) {
    console.log(`    [DRY RUN] Would generate snapshot for ${retailerId}/${month} (${rowCount} competitor rows)`);
    return { retailerId, month, operation: 'skipped', rowCount };
  }

  // Step 2: Get Shareight's own impression share from is_self rows.
  const selfResult = await client.query<{ avg_impr_share: string | null }>(`
    SELECT AVG(impr_share::numeric) AS avg_impr_share
    FROM auction_insights
    WHERE retailer_id = $1
      AND month = $2
      AND is_self = true
      AND preferred_for_display = true
  `, [retailerId, monthDate]);

  const avgImpressionShare = selfResult.rows[0]?.avg_impr_share != null
    ? Number(selfResult.rows[0].avg_impr_share)
    : null;

  // Step 3: Aggregate competitors by shop_display_name across all campaigns.
  const competitorsResult = await client.query<{
    shop_display_name: string;
    avg_overlap: string;
    avg_outranking: string;
    avg_impr_share: string | null;
    campaign_count: string;
  }>(`
    SELECT
      shop_display_name,
      AVG(overlap_rate::numeric)      AS avg_overlap,
      AVG(outranking_share::numeric)  AS avg_outranking,
      AVG(impr_share::numeric)        AS avg_impr_share,
      COUNT(DISTINCT campaign_name)   AS campaign_count
    FROM auction_insights
    WHERE retailer_id = $1
      AND month = $2
      AND NOT is_self
      AND preferred_for_display = true
    GROUP BY shop_display_name
    ORDER BY avg_overlap DESC NULLS LAST
  `, [retailerId, monthDate]);

  const competitors = competitorsResult.rows;
  if (competitors.length === 0) {
    return { retailerId, month, operation: 'skipped', rowCount: 0 };
  }

  // Step 4: Derive summary metrics.
  const totalCompetitors = competitors.length;
  const avgOverlapRate = competitors.reduce((sum, c) => sum + Number(c.avg_overlap), 0) / totalCompetitors;
  const avgOutrankingShare = competitors.reduce((sum, c) => sum + Number(c.avg_outranking), 0) / totalCompetitors;
  const avgBeingOutranked = 1 - avgOutrankingShare;

  // Step 5: Classify competitors.
  const topCompetitor = competitors[0]; // Sorted by avg_overlap DESC

  const biggestThreat = [...competitors].sort((a, b) => {
    const scoreA = Number(a.avg_overlap) * (1 - Number(a.avg_outranking));
    const scoreB = Number(b.avg_overlap) * (1 - Number(b.avg_outranking));
    return scoreB - scoreA;
  })[0];

  const bestOpportunity = [...competitors].sort((a, b) => {
    const scoreA = Number(a.avg_overlap) * Number(a.avg_outranking);
    const scoreB = Number(b.avg_overlap) * Number(b.avg_outranking);
    return scoreB - scoreA;
  })[0];

  // Step 6: Build competitors JSONB payload (top 20 by overlap for UI).
  const n = (v: number | null) => v != null ? Number(v.toFixed(4)) : null;

  const topCompetitorsJson = competitors.slice(0, 20).map(c => ({
    id: c.shop_display_name,
    overlap_rate: Number(Number(c.avg_overlap).toFixed(4)),
    outranking_share: Number(Number(c.avg_outranking).toFixed(4)),
    impression_share: c.avg_impr_share != null ? Number(Number(c.avg_impr_share).toFixed(4)) : null,
    campaign_count: Number(c.campaign_count),
  }));

  // Step 7: Upsert into auction_insights_snapshots.
  await client.query(`
    INSERT INTO auction_insights_snapshots (
      retailer_id, range_type, range_start, range_end, snapshot_date, last_updated,
      avg_impression_share, total_competitors,
      avg_overlap_rate, avg_outranking_share, avg_being_outranked,
      competitors,
      top_competitor_id, top_competitor_overlap_rate, top_competitor_outranking_you,
      biggest_threat_id, biggest_threat_overlap_rate, biggest_threat_outranking_you,
      best_opportunity_id, best_opportunity_overlap_rate, best_opportunity_you_outranking,
      actual_data_start, actual_data_end
    ) VALUES (
      $1, 'month', $2, $3, $4, NOW(),
      $5, $6,
      $7, $8, $9,
      $10,
      $11, $12, $13,
      $14, $15, $16,
      $17, $18, $19,
      $20, $21
    )
    ON CONFLICT (retailer_id, range_type, range_start, range_end)
    DO UPDATE SET
      last_updated                    = EXCLUDED.last_updated,
      avg_impression_share            = EXCLUDED.avg_impression_share,
      total_competitors               = EXCLUDED.total_competitors,
      avg_overlap_rate                = EXCLUDED.avg_overlap_rate,
      avg_outranking_share            = EXCLUDED.avg_outranking_share,
      avg_being_outranked             = EXCLUDED.avg_being_outranked,
      competitors                     = EXCLUDED.competitors,
      top_competitor_id               = EXCLUDED.top_competitor_id,
      top_competitor_overlap_rate     = EXCLUDED.top_competitor_overlap_rate,
      top_competitor_outranking_you   = EXCLUDED.top_competitor_outranking_you,
      biggest_threat_id               = EXCLUDED.biggest_threat_id,
      biggest_threat_overlap_rate     = EXCLUDED.biggest_threat_overlap_rate,
      biggest_threat_outranking_you   = EXCLUDED.biggest_threat_outranking_you,
      best_opportunity_id             = EXCLUDED.best_opportunity_id,
      best_opportunity_overlap_rate   = EXCLUDED.best_opportunity_overlap_rate,
      best_opportunity_you_outranking = EXCLUDED.best_opportunity_you_outranking,
      actual_data_start               = EXCLUDED.actual_data_start,
      actual_data_end                 = EXCLUDED.actual_data_end
  `, [
    retailerId, rangeStart, rangeEnd, rangeStart, // snapshot_date = rangeStart
    n(avgImpressionShare), totalCompetitors,
    n(avgOverlapRate), n(avgOutrankingShare), n(avgBeingOutranked),
    JSON.stringify(topCompetitorsJson),
    topCompetitor.shop_display_name, n(Number(topCompetitor.avg_overlap)), n(Number(topCompetitor.avg_outranking)),
    biggestThreat.shop_display_name, n(Number(biggestThreat.avg_overlap)), n(Number(biggestThreat.avg_outranking)),
    bestOpportunity.shop_display_name, n(Number(bestOpportunity.avg_overlap)), n(Number(bestOpportunity.avg_outranking)),
    rangeStart,
    rangeEnd,
  ]);

  // Step 8: Update retailer_snapshot_health so the retailer selection page
  // shows the correct auction dot colour and last-successful period.
  await client.query(`
    INSERT INTO retailer_snapshot_health (
      retailer_id, snapshot_type, status,
      last_attempted_at, last_successful_at, last_successful_period, record_count
    ) VALUES ($1, 'auctions', 'ok', NOW(), NOW(), $2, $3)
    ON CONFLICT (retailer_id, snapshot_type) DO UPDATE SET
      status                 = 'ok',
      last_attempted_at      = NOW(),
      last_successful_at     = NOW(),
      last_successful_period = EXCLUDED.last_successful_period,
      record_count           = EXCLUDED.record_count
  `, [retailerId, month, totalCompetitors]);

  return { retailerId, month, operation: 'created', rowCount: 1 };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const options: ScriptOptions = { dryRun: false, force: false };

  for (const arg of args) {
    if (arg.startsWith('--retailer=')) options.retailer = arg.split('=')[1];
    else if (arg.startsWith('--month=')) options.month = arg.split('=')[1];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (options.month && !/^\d{4}-\d{2}$/.test(options.month)) {
    console.error('--month must be in YYYY-MM format');
    process.exit(1);
  }

  const pool = new Pool(SV_DB_CONFIG);

  try {
    const client = await pool.connect();

    try {
      console.log('========================================');
      console.log('Auction Snapshot Generator');
      console.log('========================================');
      if (options.dryRun) console.log('[DRY RUN MODE]');
      if (options.retailer) console.log(`Retailer filter: ${options.retailer}`);
      if (options.month) console.log(`Month filter:    ${options.month}`);
      console.log('');

      // Step 1: Find distinct (retailer_id, month) pairs in auction_insights.
      const whereClause: string[] = ['retailer_id IS NOT NULL'];
      const params: unknown[] = [];

      if (options.retailer) {
        params.push(options.retailer);
        whereClause.push(`retailer_id = $${params.length}`);
      }
      if (options.month) {
        params.push(options.month + '-01');
        whereClause.push(`month = $${params.length}`);
      }

      const pairsResult = await client.query<{ retailer_id: string; month: string }>(`
        SELECT DISTINCT retailer_id, to_char(month, 'YYYY-MM-01') AS month
        FROM auction_insights
        WHERE ${whereClause.join(' AND ')}
        ORDER BY retailer_id, month
      `, params);

      const pairs = pairsResult.rows;
      console.log(`Found ${pairs.length} retailer/month pair(s) to process.\n`);

      if (pairs.length === 0) {
        console.log('Nothing to do.');
        return;
      }

      // Step 2: Optionally skip pairs that already have snapshots.
      let toProcess = pairs;

      if (!options.force) {
        const existingResult = await client.query<{ retailer_id: string; range_start: string }>(`
          SELECT retailer_id, to_char(range_start, 'YYYY-MM-01') AS range_start
          FROM auction_insights_snapshots
          WHERE range_type = 'month'
            AND retailer_id = ANY($1::text[])
        `, [pairs.map(p => p.retailer_id)]);

        const existingSet = new Set(
          existingResult.rows.map(r => `${r.retailer_id}::${r.range_start}`)
        );

        const skippedCount = pairs.filter(p => existingSet.has(`${p.retailer_id}::${p.month}`)).length;
        toProcess = pairs.filter(p => !existingSet.has(`${p.retailer_id}::${p.month}`));

        if (skippedCount > 0) {
          console.log(`Skipping ${skippedCount} pairs that already have snapshots (use --force to regenerate).\n`);
        }
      }

      // Step 3: Process each pair.
      const results: SnapshotResult[] = [];

      for (const pair of toProcess) {
        const monthDate = pair.month; // YYYY-MM-01
        const monthYear = monthDate.slice(0, 7); // YYYY-MM

        // Calculate last day of month for rangeEnd.
        const [y, m] = monthYear.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate(); // Day 0 of next month = last day of this month
        const rangeEnd = `${monthYear}-${String(lastDay).padStart(2, '0')}`;

        process.stdout.write(`  ${pair.retailer_id} / ${monthYear} ... `);

        try {
          const result = await generateAuctionSnapshot(
            client,
            pair.retailer_id,
            monthDate,
            monthDate,  // rangeStart = first of month
            rangeEnd,
            options.dryRun,
          );
          results.push(result);
          console.log(result.operation === 'created' ? '✓ created' : '– skipped');
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ retailerId: pair.retailer_id, month: monthYear, operation: 'error', rowCount: 0, error });
          console.log(`✗ ERROR: ${error}`);
        }
      }

      // Step 4: Summary
      const created = results.filter(r => r.operation === 'created').length;
      const skipped = results.filter(r => r.operation === 'skipped').length;
      const errored = results.filter(r => r.operation === 'error').length;

      console.log('\n========================================');
      console.log(`Created:  ${created}`);
      console.log(`Skipped:  ${skipped}`);
      if (errored > 0) console.log(`Errors:   ${errored}`);
      console.log('========================================');

      if (errored > 0) {
        process.exit(1);
      }

    } finally {
      client.release();
    }

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
