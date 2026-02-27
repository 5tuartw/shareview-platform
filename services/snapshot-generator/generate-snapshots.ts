/**
 * Snapshot Generator Service
 * 
 * Aggregates raw performance data from source database into monthly snapshots.
 * This service handles data aggregation ONLY - analysis/classification is separate.
 * 
 * @module services/snapshot-generator
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local (project root) BEFORE importing db
config({ path: resolve(process.cwd(), '.env.local') });

import { Pool } from 'pg';

// ============================================================================
// Types
// ============================================================================

interface RetailerConfig {
  retailerId: string;
  retailerName: string;
  snapshotEnabled: boolean;
  defaultRanges: string[];
  detailLevel: 'summary' | 'detail' | 'full';
}

interface MonthToProcess {
  retailerId: string;
  year: number;
  month: number;
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string;   // YYYY-MM-DD
  lastFetchDatetime: Date;
}

interface GeneratorOptions {
  retailer?: string;
  month?: string; // YYYY-MM format
  dryRun?: boolean;
  force?: boolean; // Skip freshness check and reprocess all months
}

interface SnapshotResult {
  domain: string;
  retailerId: string;
  month: string;
  rowCount: number;
  operation: 'created' | 'updated' | 'skipped';
}

// ============================================================================
// Configuration
// ============================================================================

const SOURCE_DB_MODE = process.env.SOURCE_DB_MODE || 'tunnel'; // 'direct' or 'tunnel'

// Determine connection details based on mode
const getSourceDbHost = () => {
  if (SOURCE_DB_MODE === 'direct') {
    return process.env.SOURCE_DB_DIRECT_HOST || '10.2.0.2';
  }
  return process.env.SOURCE_DB_TUNNEL_HOST || '127.0.0.1';
};

const getSourceDbPort = () => {
  if (SOURCE_DB_MODE === 'direct') {
    return parseInt(process.env.SOURCE_DB_DIRECT_PORT || '8007');
  }
  return parseInt(process.env.SOURCE_DB_TUNNEL_PORT || '18007');
};

const SOURCE_DB_CONFIG = {
  host: getSourceDbHost(),
  port: getSourceDbPort(),
  user: process.env.SOURCE_DB_USER || 'postgres',
  password: process.env.SOURCE_DB_PASS,
  database: process.env.SOURCE_DB_NAME || 'acc_mgmt',
};

const SV_DB_CONFIG = {
  host: process.env.SV_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER || process.env.SV_DBUSER || 'sv_user',
  password: process.env.SV_DB_PASS || process.env.SV_DBPASSWORD,
  database: process.env.SV_DB_NAME || process.env.SV_DBNAME || 'shareview',
};

// ============================================================================
// Keyword Snapshot Configuration
// ============================================================================
// These thresholds control which keywords are included in snapshot quadrants.
// See docs/keyword-snapshot-thresholds.md for detailed explanation and rationale.

const KEYWORD_THRESHOLDS = {
  // Qualification criteria (applies to all quadrants)
  MIN_IMPRESSIONS: 50,  // Minimum impressions to be considered "qualified"
  MIN_CLICKS: 5,        // Minimum clicks to be considered "qualified"
  
  // Quadrant limits (adaptive - takes top N from each quadrant)
  LIMIT_WINNERS: 100,                   // High CTR + Conversions (scale opportunities)
  LIMIT_CSS_WINS_RETAILER_LOSES: 50,    // High CTR + No Conversions (retailer issues)
  LIMIT_HIDDEN_GEMS: 100,                // Low CTR + Conversions (CSS opportunities)
  LIMIT_POOR_PERFORMERS: 50,             // Low CTR + No Conversions (wasteful spend)
} as const;

// ============================================================================
// Database Connections
// ============================================================================

let sourcePool: Pool | null = null;
let targetPool: Pool | null = null;

function getSourcePool(): Pool {
  if (!sourcePool) {
    sourcePool = new Pool(SOURCE_DB_CONFIG);
  }
  return sourcePool;
}

function getTargetPool(): Pool {
  if (!targetPool) {
    targetPool = new Pool(SV_DB_CONFIG);
  }
  return targetPool;
}

async function closePools(): Promise<void> {
  if (sourcePool) {
    await sourcePool.end();
    sourcePool = null;
  }
  if (targetPool) {
    await targetPool.end();
    targetPool = null;
  }
}

// ============================================================================
// Retailer Configuration
// ============================================================================

/**
 * Get list of retailers with snapshots enabled
 */
async function getEnabledRetailers(options: GeneratorOptions): Promise<RetailerConfig[]> {
  const pool = getTargetPool();
  
  let query = `
    SELECT 
      retailer_id,
      retailer_name,
      snapshot_enabled,
      snapshot_default_ranges as default_ranges,
      snapshot_detail_level as detail_level
    FROM retailer_metadata
    WHERE snapshot_enabled = true
  `;
  
  const params: string[] = [];
  
  if (options.retailer) {
    query += ` AND retailer_id = $1`;
    params.push(options.retailer);
  }
  
  query += ` ORDER BY retailer_id`;
  
  const result = await pool.query(query, params);
  
  return result.rows.map(row => ({
    retailerId: row.retailer_id,
    retailerName: row.retailer_name,
    snapshotEnabled: row.snapshot_enabled,
    defaultRanges: row.default_ranges || ['month'],
    detailLevel: row.detail_level || 'summary',
  }));
}

// ============================================================================
// Month Detection
// ============================================================================

/**
 * Identify months that need snapshot generation
 * 
 * Processes calendar months where:
 * 1. Source data exists
 * 2. Source data is newer than existing snapshot (if any)
 * 
 * Note: Includes current month since keyword metrics (CTR, CVR) are
 * valid percentages at any point, unlike cumulative metrics (GMV, profit)
 */
async function identifyMonthsToProcess(
  retailerId: string,
  options: GeneratorOptions
): Promise<MonthToProcess[]> {
  const sourcePool = getSourcePool();
  const targetPool = getTargetPool();
  
  // If specific month requested, process only that month
  if (options.month) {
    const [year, month] = options.month.split('-').map(Number);
    const rangeStart = `${year}-${month.toString().padStart(2, '0')}-01`;
    const rangeEnd = getMonthEnd(year, month);
    
    // Get latest fetch_datetime for this month from source
    const sourceResult = await sourcePool.query(`
      SELECT MAX(fetch_datetime) as last_fetch
      FROM keywords
      WHERE retailer_id = $1
        AND insight_date >= $2
        AND insight_date <= $3
    `, [retailerId, rangeStart, rangeEnd]);
    
    if (!sourceResult.rows[0].last_fetch) {
      console.log(`No source data for ${retailerId} ${options.month}`);
      return [];
    }
    
    return [{
      retailerId,
      year,
      month,
      rangeStart,
      rangeEnd,
      lastFetchDatetime: sourceResult.rows[0].last_fetch,
    }];
  }
  
  // Otherwise, auto-detect months with new data
  // Get all months with data in source (last 60 days typically)
  const sourceResult = await sourcePool.query(`
    SELECT 
      EXTRACT(YEAR FROM insight_date) as year,
      EXTRACT(MONTH FROM insight_date) as month,
      MAX(fetch_datetime) as last_fetch
    FROM keywords
    WHERE retailer_id = $1
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 DESC
  `, [retailerId]);
  
  const monthsToProcess: MonthToProcess[] = [];
  
  for (const row of sourceResult.rows) {
    const year = parseInt(row.year);
    const month = parseInt(row.month);
    
    const rangeStart = `${year}-${month.toString().padStart(2, '0')}-01`;
    const rangeEnd = getMonthEnd(year, month);
    
    // Check if snapshot exists and if source is newer
    const snapshotResult = await targetPool.query(`
      SELECT last_updated
      FROM keywords_snapshots
      WHERE retailer_id = $1
        AND range_type = 'month'
        AND range_start = $2
        AND range_end = $3
    `, [retailerId, rangeStart, rangeEnd]);
    
    const snapshotLastUpdated = snapshotResult.rows[0]?.last_updated;
    const sourceFetchDatetime = new Date(row.last_fetch);
    
    // Process if no snapshot exists OR source is newer OR force flag set
    if (options.force || !snapshotLastUpdated || sourceFetchDatetime > new Date(snapshotLastUpdated)) {
      monthsToProcess.push({
        retailerId,
        year,
        month,
        rangeStart,
        rangeEnd,
        lastFetchDatetime: sourceFetchDatetime,
      });
    }
  }
  
  return monthsToProcess;
}

/**
 * Get last day of month in YYYY-MM-DD format
 */
function getMonthEnd(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
}

// ============================================================================
// Dry-Run Preview Functions
// ============================================================================

async function previewKeywordSnapshot(monthData: MonthToProcess): Promise<void> {
  const source = getSourcePool();
  const { retailerId, rangeStart, rangeEnd } = monthData;

  // Get aggregate stats
  const aggregateResult = await source.query(`
    SELECT
      COUNT(DISTINCT search_term)::int AS total_keywords,
      COALESCE(SUM(impressions), 0)::bigint AS total_impressions,
      COALESCE(SUM(clicks), 0)::bigint AS total_clicks,
      COALESCE(SUM(conversions), 0)::numeric AS total_conversions,
      CASE
        WHEN COALESCE(SUM(impressions), 0) > 0
          THEN (SUM(clicks)::numeric / SUM(impressions)) * 100
        ELSE NULL
      END AS overall_ctr,
      CASE
        WHEN COALESCE(SUM(clicks), 0) > 0
          THEN (SUM(conversions)::numeric / SUM(clicks)) * 100
        ELSE NULL
      END AS overall_cvr
    FROM keywords
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
  `, [retailerId, rangeStart, rangeEnd]);

  const aggregate = aggregateResult.rows[0];
  
  console.log('    📊 KEYWORDS SNAPSHOT PREVIEW');
  console.log('    ─────────────────────────────────────────');
  console.log(`    Total Keywords: ${aggregate.total_keywords?.toLocaleString() || 0}`);
  console.log(`    Total Impressions: ${aggregate.total_impressions?.toLocaleString() || 0}`);
  console.log(`    Total Clicks: ${aggregate.total_clicks?.toLocaleString() || 0}`);
  console.log(`    Total Conversions: ${aggregate.total_conversions || 0}`);
  console.log(`    Overall CTR: ${aggregate.overall_ctr ? Number(aggregate.overall_ctr).toFixed(2) + '%' : 'N/A'}`);
  console.log(`    Overall CVR: ${aggregate.overall_cvr ? Number(aggregate.overall_cvr).toFixed(2) + '%' : 'N/A'}`);

  // Get median CTR
  const medianResult = await source.query(`
    WITH aggregated AS (
      SELECT
        search_term,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_conversions,
        CASE WHEN SUM(impressions) > 0 
          THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 
          ELSE 0 
        END as ctr
      FROM keywords
      WHERE retailer_id = $1
        AND insight_date BETWEEN $2 AND $3
      GROUP BY search_term
      HAVING SUM(impressions) >= $4 AND SUM(clicks) >= $5
    )
    SELECT 
      COUNT(*)::int as qualified_count,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ctr)::numeric as median_ctr
    FROM aggregated
  `, [retailerId, rangeStart, rangeEnd, KEYWORD_THRESHOLDS.MIN_IMPRESSIONS, KEYWORD_THRESHOLDS.MIN_CLICKS]);

  const medianData = medianResult.rows[0];
  const medianCtr = medianData?.median_ctr || 0;
  const qualifiedCount = medianData?.qualified_count || 0;

  console.log(`\n    📈 QUALIFICATION (≥${KEYWORD_THRESHOLDS.MIN_IMPRESSIONS} impressions, ≥${KEYWORD_THRESHOLDS.MIN_CLICKS} clicks)`);
  console.log('    ─────────────────────────────────────────');
  console.log(`    Qualified Keywords: ${qualifiedCount.toLocaleString()}`);
  console.log(`    Median CTR Threshold: ${Number(medianCtr).toFixed(2)}%`);

  // Get quadrant counts and samples
  const quadrantsResult = await source.query(`
    WITH aggregated AS (
      SELECT
        search_term,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_conversions,
        CASE WHEN SUM(impressions) > 0 
          THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 
          ELSE 0 
        END as ctr,
        CASE WHEN SUM(clicks) > 0 
          THEN (SUM(conversions)::numeric / SUM(clicks)) * 100 
          ELSE 0 
        END as cvr
      FROM keywords
      WHERE retailer_id = $1
        AND insight_date BETWEEN $2 AND $3
      GROUP BY search_term
      HAVING SUM(impressions) >= $4 AND SUM(clicks) >= $5
    )
    SELECT
      COUNT(*) FILTER (WHERE ctr >= $6 AND total_conversions > 0)::int as winner_count,
      COUNT(*) FILTER (WHERE ctr >= $6 AND total_conversions = 0)::int as css_wins_count,
      COUNT(*) FILTER (WHERE ctr < $6 AND total_conversions > 0)::int as hidden_gems_count,
      COUNT(*) FILTER (WHERE ctr < $6 AND total_conversions = 0)::int as poor_performers_count,
      (SELECT json_agg(row_to_json(t)) FROM (
        SELECT search_term, total_clicks, ROUND(total_conversions, 2) as conversions, ROUND(ctr, 2) as ctr, ROUND(cvr, 2) as cvr
        FROM aggregated WHERE ctr >= $6 AND total_conversions > 0
        ORDER BY total_conversions DESC LIMIT 3
      ) t) as winner_samples,
      (SELECT json_agg(row_to_json(t)) FROM (
        SELECT search_term, total_clicks, ROUND(ctr, 2) as ctr
        FROM aggregated WHERE ctr >= $6 AND total_conversions = 0
        ORDER BY total_clicks DESC LIMIT 3
      ) t) as css_wins_samples,
      (SELECT json_agg(row_to_json(t)) FROM (
        SELECT search_term, total_clicks, ROUND(total_conversions, 2) as conversions, ROUND(ctr, 2) as ctr, ROUND(cvr, 2) as cvr
        FROM aggregated WHERE ctr < $6 AND total_conversions > 0
        ORDER BY total_conversions DESC LIMIT 3
      ) t) as hidden_gems_samples,
      (SELECT json_agg(row_to_json(t)) FROM (
        SELECT search_term, total_clicks, ROUND(ctr, 2) as ctr
        FROM aggregated WHERE ctr < $6 AND total_conversions = 0
        ORDER BY total_clicks DESC LIMIT 3
      ) t) as poor_performers_samples
    FROM aggregated
  `, [
    retailerId,
    rangeStart,
    rangeEnd,
    KEYWORD_THRESHOLDS.MIN_IMPRESSIONS,
    KEYWORD_THRESHOLDS.MIN_CLICKS,
    medianCtr,
  ]);

  const quadrants = quadrantsResult.rows[0];

  console.log(`\n    🎯 QUADRANT ANALYSIS (2x2 Matrix)`);
  console.log('    ─────────────────────────────────────────');
  
  console.log(`\n    🏆 WINNERS (High CTR + Conversions)`);
  console.log(`       Count: ${quadrants.winner_count} (storing up to ${KEYWORD_THRESHOLDS.LIMIT_WINNERS})`);
  if (quadrants.winner_samples && quadrants.winner_samples.length > 0) {
    quadrants.winner_samples.forEach((kw: any) => {
      console.log(`       • "${kw.search_term}" - ${kw.conversions} conv, ${kw.ctr}% CTR, ${kw.cvr}% CVR`);
    });
  }

  console.log(`\n    ⚠️  CSS WINS, RETAILER LOSES (High CTR + No Conversions)`);
  console.log(`       Count: ${quadrants.css_wins_count} (storing up to ${KEYWORD_THRESHOLDS.LIMIT_CSS_WINS_RETAILER_LOSES})`);
  if (quadrants.css_wins_samples && quadrants.css_wins_samples.length > 0) {
    quadrants.css_wins_samples.forEach((kw: any) => {
      console.log(`       • "${kw.search_term}" - ${kw.total_clicks} clicks, ${kw.ctr}% CTR, 0 conversions`);
    });
  }

  console.log(`\n    💎 HIDDEN GEMS (Low CTR + Conversions)`);
  console.log(`       Count: ${quadrants.hidden_gems_count} (storing up to ${KEYWORD_THRESHOLDS.LIMIT_HIDDEN_GEMS})`);
  if (quadrants.hidden_gems_samples && quadrants.hidden_gems_samples.length > 0) {
    quadrants.hidden_gems_samples.forEach((kw: any) => {
      console.log(`       • "${kw.search_term}" - ${kw.conversions} conv, ${kw.ctr}% CTR, ${kw.cvr}% CVR`);
    });
  }

  console.log(`\n    ❌ POOR PERFORMERS (Low CTR + No Conversions)`);
  console.log(`       Count: ${quadrants.poor_performers_count} (storing up to ${KEYWORD_THRESHOLDS.LIMIT_POOR_PERFORMERS})`);
  if (quadrants.poor_performers_samples && quadrants.poor_performers_samples.length > 0) {
    quadrants.poor_performers_samples.forEach((kw: any) => {
      console.log(`       • "${kw.search_term}" - ${kw.total_clicks} clicks, ${kw.ctr}% CTR, 0 conversions`);
    });
  }

  console.log('    ─────────────────────────────────────────\n');
}

// ============================================================================
// Snapshot Aggregation
// ============================================================================

async function generateKeywordSnapshot(monthData: MonthToProcess): Promise<SnapshotResult> {
  const source = getSourcePool();
  const target = getTargetPool();
  const { retailerId, rangeStart, rangeEnd } = monthData;

  // Step 1: Get overall aggregate metrics
  const aggregateResult = await source.query(`
    SELECT
      COUNT(*)::int AS row_count,
      COUNT(DISTINCT search_term)::int AS total_keywords,
      COALESCE(SUM(impressions), 0)::bigint AS total_impressions,
      COALESCE(SUM(clicks), 0)::bigint AS total_clicks,
      COALESCE(SUM(conversions), 0)::numeric AS total_conversions,
      CASE
        WHEN COALESCE(SUM(impressions), 0) > 0
          THEN (SUM(clicks)::numeric / SUM(impressions)) * 100
        ELSE NULL
      END AS overall_ctr,
      CASE
        WHEN COALESCE(SUM(clicks), 0) > 0
          THEN (SUM(conversions)::numeric / SUM(clicks)) * 100
        ELSE NULL
      END AS overall_cvr
    FROM keywords
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
  `, [retailerId, rangeStart, rangeEnd]);

  const aggregate = aggregateResult.rows[0];
  if (!aggregate || Number(aggregate.row_count) === 0) {
    return {
      domain: 'keywords',
      retailerId,
      month: rangeStart.slice(0, 7),
      rowCount: 0,
      operation: 'skipped',
    };
  }

  // Step 2: Calculate median CTR for this retailer/period (adaptive threshold)
  const medianResult = await source.query(`
    WITH aggregated AS (
      SELECT
        search_term,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_conversions,
        CASE WHEN SUM(impressions) > 0 
          THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 
          ELSE 0 
        END as ctr
      FROM keywords
      WHERE retailer_id = $1
        AND insight_date BETWEEN $2 AND $3
      GROUP BY search_term
      HAVING SUM(impressions) >= $4 AND SUM(clicks) >= $5
    )
    SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ctr)::numeric as median_ctr
    FROM aggregated
  `, [retailerId, rangeStart, rangeEnd, KEYWORD_THRESHOLDS.MIN_IMPRESSIONS, KEYWORD_THRESHOLDS.MIN_CLICKS]);

  const medianCtr = medianResult.rows[0]?.median_ctr || 0;

  // Step 3: Fetch 4-quadrant keyword analysis with adaptive limits
  const quadrantsResult = await source.query(`
    WITH aggregated AS (
      SELECT
        search_term,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_conversions,
        CASE WHEN SUM(impressions) > 0 
          THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 
          ELSE 0 
        END as ctr,
        CASE WHEN SUM(clicks) > 0 
          THEN (SUM(conversions)::numeric / SUM(clicks)) * 100 
          ELSE 0 
        END as cvr
      FROM keywords
      WHERE retailer_id = $1
        AND insight_date BETWEEN $2 AND $3
      GROUP BY search_term
      HAVING SUM(impressions) >= $4 AND SUM(clicks) >= $5
    ),
    winners AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', total_impressions,
        'clicks', total_clicks,
        'conversions', ROUND(total_conversions, 2),
        'ctr', ROUND(ctr, 2),
        'cvr', ROUND(cvr, 2)
      ) as keyword_data
      FROM aggregated
      WHERE ctr >= $6 AND total_conversions > 0
      ORDER BY total_conversions DESC
      LIMIT $7
    ),
    css_wins_retailer_loses AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', total_impressions,
        'clicks', total_clicks,
        'conversions', ROUND(total_conversions, 2),
        'ctr', ROUND(ctr, 2),
        'cvr', ROUND(cvr, 2)
      ) as keyword_data
      FROM aggregated
      WHERE ctr >= $6 AND total_conversions = 0
      ORDER BY total_clicks DESC
      LIMIT $8
    ),
    hidden_gems AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', total_impressions,
        'clicks', total_clicks,
        'conversions', ROUND(total_conversions, 2),
        'ctr', ROUND(ctr, 2),
        'cvr', ROUND(cvr, 2)
      ) as keyword_data
      FROM aggregated
      WHERE ctr < $6 AND total_conversions > 0
      ORDER BY total_conversions DESC
      LIMIT $9
    ),
    poor_performers AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', total_impressions,
        'clicks', total_clicks,
        'conversions', ROUND(total_conversions, 2),
        'ctr', ROUND(ctr, 2),
        'cvr', ROUND(cvr, 2)
      ) as keyword_data
      FROM aggregated
      WHERE ctr < $6 AND total_conversions = 0
      ORDER BY total_clicks DESC
      LIMIT $10
    )
    SELECT
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM winners) as winners,
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM css_wins_retailer_loses) as css_wins,
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM hidden_gems) as hidden_gems,
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM poor_performers) as poor_performers
  `, [
    retailerId,
    rangeStart,
    rangeEnd,
    KEYWORD_THRESHOLDS.MIN_IMPRESSIONS,
    KEYWORD_THRESHOLDS.MIN_CLICKS,
    medianCtr,
    KEYWORD_THRESHOLDS.LIMIT_WINNERS,
    KEYWORD_THRESHOLDS.LIMIT_CSS_WINS_RETAILER_LOSES,
    KEYWORD_THRESHOLDS.LIMIT_HIDDEN_GEMS,
    KEYWORD_THRESHOLDS.LIMIT_POOR_PERFORMERS,
  ]);

  const quadrants = quadrantsResult.rows[0] || {
    winners: [],
    css_wins: [],
    hidden_gems: [],
    poor_performers: [],
  };

  // Build top_keywords JSONB with all 4 quadrants
  const topKeywords = {
    winners: quadrants.winners,
    css_wins_retailer_loses: quadrants.css_wins,
    hidden_gems: quadrants.hidden_gems,
    poor_performers: quadrants.poor_performers,
    median_ctr: medianCtr ? Number(Number(medianCtr).toFixed(2)) : 0,
    qualification: {
      min_impressions: KEYWORD_THRESHOLDS.MIN_IMPRESSIONS,
      min_clicks: KEYWORD_THRESHOLDS.MIN_CLICKS,
    },
  };

  // Step 4: Insert/update snapshot with aggregates and quadrants
  const upsertResult = await target.query(`
    INSERT INTO keywords_snapshots (
      retailer_id,
      range_type,
      range_start,
      range_end,
      total_keywords,
      total_impressions,
      total_clicks,
      total_conversions,
      overall_ctr,
      overall_cvr,
      top_keywords
    ) VALUES (
      $1, 'month', $2, $3,
      $4, $5, $6, $7, $8, $9, $10
    )
    ON CONFLICT (retailer_id, range_type, range_start, range_end)
    DO UPDATE SET
      total_keywords = EXCLUDED.total_keywords,
      total_impressions = EXCLUDED.total_impressions,
      total_clicks = EXCLUDED.total_clicks,
      total_conversions = EXCLUDED.total_conversions,
      overall_ctr = EXCLUDED.overall_ctr,
      overall_cvr = EXCLUDED.overall_cvr,
      top_keywords = EXCLUDED.top_keywords,
      last_updated = NOW()
    RETURNING (xmax = 0) AS inserted
  `, [
    retailerId,
    rangeStart,
    rangeEnd,
    aggregate.total_keywords,
    aggregate.total_impressions,
    aggregate.total_clicks,
    aggregate.total_conversions,
    aggregate.overall_ctr,
    aggregate.overall_cvr,
    JSON.stringify(topKeywords),
  ]);

  const inserted = upsertResult.rows[0]?.inserted === true;

  return {
    domain: 'keywords',
    retailerId,
    month: rangeStart.slice(0, 7),
    rowCount: Number(aggregate.total_keywords),
    operation: inserted ? 'created' : 'updated',
  };
}

async function generateCategorySnapshot(monthData: MonthToProcess): Promise<SnapshotResult> {
  const source = getSourcePool();
  const target = getTargetPool();
  const { retailerId, rangeStart, rangeEnd } = monthData;

  // Step 1: Get all unique category paths with their node-only metrics
  // Node metrics = products at THIS level, not in any child category
  const nodeMetricsResult = await source.query(`
    SELECT
      category_level1,
      category_level2,
      category_level3,
      category_level4,
      category_level5,
      SUM(impressions)::bigint AS node_impressions,
      SUM(clicks)::bigint AS node_clicks,
      SUM(conversions)::numeric(10,2) AS node_conversions,
      CASE 
        WHEN SUM(impressions) > 0 
        THEN (SUM(clicks)::numeric / SUM(impressions)) * 100
        ELSE NULL
      END AS node_ctr,
      CASE 
        WHEN SUM(clicks) > 0 
        THEN (SUM(conversions)::numeric / SUM(clicks)) * 100
        ELSE NULL
      END AS node_cvr
    FROM category_performance
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
    GROUP BY category_level1, category_level2, category_level3, category_level4, category_level5
  `, [retailerId, rangeStart, rangeEnd]);

  if (nodeMetricsResult.rows.length === 0) {
    return {
      domain: 'categories',
      retailerId,
      month: rangeStart.slice(0, 7),
      rowCount: 0,
      operation: 'skipped',
    };
  }

  // Step 2: Build category tree structure with branch metrics
  interface CategoryNode {
    level1: string;
    level2: string;
    level3: string;
    level4: string;
    level5: string;
    full_path: string;
    depth: number;
    parent_path: string | null;
    node_impressions: number;
    node_clicks: number;
    node_conversions: number;
    node_ctr: number | null;
    node_cvr: number | null;
    branch_impressions: number;
    branch_clicks: number;
    branch_conversions: number;
    branch_ctr: number | null;
    branch_cvr: number | null;
    health_status_node: string | null;
    health_status_branch: string | null;
  }

  const categoryMap = new Map<string, CategoryNode>();

  // Helper to build full path from levels
  const buildPath = (l1: string, l2: string, l3: string, l4: string, l5: string): string => {
    const parts = [l1, l2, l3, l4, l5].filter(p => p && p !== '');
    return parts.join(' > ');
  };

  // Helper to get parent path
  const getParentPath = (l1: string, l2: string, l3: string, l4: string, l5: string): string | null => {
    if (l5) return buildPath(l1, l2, l3, l4, '');
    if (l4) return buildPath(l1, l2, l3, '', '');
    if (l3) return buildPath(l1, l2, '', '', '');
    if (l2) return buildPath(l1, '', '', '', '');
    return null; // level 1 has no parent
  };

  // Helper to get depth
  const getDepth = (l1: string, l2: string, l3: string, l4: string, l5: string): number => {
    if (l5) return 5;
    if (l4) return 4;
    if (l3) return 3;
    if (l2) return 2;
    return 1;
  };

  // Build initial nodes with node metrics
  for (const row of nodeMetricsResult.rows) {
    const l1 = row.category_level1 || '';
    const l2 = row.category_level2 || '';
    const l3 = row.category_level3 || '';
    const l4 = row.category_level4 || '';
    const l5 = row.category_level5 || '';

    const full_path = buildPath(l1, l2, l3, l4, l5);
    
    categoryMap.set(full_path, {
      level1: l1,
      level2: l2,
      level3: l3,
      level4: l4,
      level5: l5,
      full_path,
      depth: getDepth(l1, l2, l3, l4, l5),
      parent_path: getParentPath(l1, l2, l3, l4, l5),
      node_impressions: Number(row.node_impressions) || 0,
      node_clicks: Number(row.node_clicks) || 0,
      node_conversions: Number(row.node_conversions) || 0,
      node_ctr: row.node_ctr ? Number(row.node_ctr) : null,
      node_cvr: row.node_cvr ? Number(row.node_cvr) : null,
      // Branch metrics start same as node, will be calculated below
      branch_impressions: Number(row.node_impressions) || 0,
      branch_clicks: Number(row.node_clicks) || 0,
      branch_conversions: Number(row.node_conversions) || 0,
      branch_ctr: row.node_ctr ? Number(row.node_ctr) : null,
      branch_cvr: row.node_cvr ? Number(row.node_cvr) : null,
      health_status_node: null,
      health_status_branch: null,
    });
  }

  // Step 2b: Synthesize missing ancestor nodes
  // The source data often has rows only at leaf/mid levels (e.g. "Health & Beauty > Personal Care > Cosmetics")
  // with NO standalone level-1 row for "Health & Beauty" itself.
  // We must create synthetic parent nodes so the tree is navigable from the top down.
  for (const path of Array.from(categoryMap.keys())) {
    const node = categoryMap.get(path)!;
    const levels = [node.level1, node.level2, node.level3, node.level4, node.level5];

    // Walk up all ancestor depths for this node
    for (let ancestorDepth = 1; ancestorDepth < node.depth; ancestorDepth++) {
      const al1 = ancestorDepth >= 1 ? levels[0] : '';
      const al2 = ancestorDepth >= 2 ? levels[1] : '';
      const al3 = ancestorDepth >= 3 ? levels[2] : '';
      const al4 = ancestorDepth >= 4 ? levels[3] : '';
      const al5 = ancestorDepth >= 5 ? levels[4] : '';

      const ancestorPath = buildPath(al1, al2, al3, al4, al5);
      if (ancestorPath && !categoryMap.has(ancestorPath)) {
        // Synthetic node — zero node metrics, branch metrics filled in during aggregation
        categoryMap.set(ancestorPath, {
          level1: al1,
          level2: al2,
          level3: al3,
          level4: al4,
          level5: al5,
          full_path: ancestorPath,
          depth: ancestorDepth,
          parent_path: getParentPath(al1, al2, al3, al4, al5),
          node_impressions: 0,
          node_clicks: 0,
          node_conversions: 0,
          node_ctr: null,
          node_cvr: null,
          branch_impressions: 0,
          branch_clicks: 0,
          branch_conversions: 0,
          branch_ctr: null,
          branch_cvr: null,
          health_status_node: null,
          health_status_branch: null,
        });
      }
    }
  }

  // Step 3: Calculate branch metrics (bottom-up aggregation)
  // Sort by depth descending so we process leaves first
  const sortedNodes = Array.from(categoryMap.values()).sort((a, b) => b.depth - a.depth);
  
  for (const node of sortedNodes) {
    // Find all children and aggregate their branch metrics into this node's branch
    for (const potentialChild of categoryMap.values()) {
      if (potentialChild.parent_path === node.full_path) {
        node.branch_impressions += potentialChild.branch_impressions;
        node.branch_clicks += potentialChild.branch_clicks;
        node.branch_conversions += potentialChild.branch_conversions;
      }
    }
    
    // Recalculate branch CTR and CVR
    node.branch_ctr = node.branch_impressions > 0 
      ? (node.branch_clicks / node.branch_impressions) * 100 
      : null;
    node.branch_cvr = node.branch_clicks > 0 
      ? (node.branch_conversions / node.branch_clicks) * 100 
      : null;
  }

  // Step 4: Classify each node's performance tier for both node-only and branch modes.
  // Tiers: star | strong | underperforming | poor
  // Classification is relative to portfolio medians (computed from all nodes with real data).

  const computeMedian = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const classifyTier = (
    ctr: number | null,
    cvr: number | null,
    impressions: number,
    clicks: number,
    conversions: number,
    medianCtr: number,
    medianCvr: number,
  ): string => {
    // Poor: no engagement or no conversions
    if (impressions === 0 || clicks === 0 || conversions === 0) return 'poor';
    if (ctr === null || cvr === null) return 'poor';
    const ctrRatio = medianCtr > 0 ? ctr / medianCtr : 0;
    const cvrRatio = medianCvr > 0 ? cvr / medianCvr : 0;
    if (ctrRatio >= 1.5 && cvrRatio >= 1.5) return 'star';
    if (ctrRatio >= 0.8 && cvrRatio >= 0.8) return 'strong';
    return 'underperforming';
  };

  // Medians from nodes that have real own-products (node impressions > 0)
  const nodeCtrValues = Array.from(categoryMap.values())
    .filter(n => n.node_impressions > 0 && n.node_ctr !== null)
    .map(n => n.node_ctr as number);
  const nodeCvrValues = Array.from(categoryMap.values())
    .filter(n => n.node_clicks > 0 && n.node_cvr !== null)
    .map(n => n.node_cvr as number);
  const medianNodeCtr = computeMedian(nodeCtrValues);
  const medianNodeCvr = computeMedian(nodeCvrValues);

  // Medians from all nodes for branch metrics
  const branchCtrValues = Array.from(categoryMap.values())
    .filter(n => n.branch_impressions > 0 && n.branch_ctr !== null)
    .map(n => n.branch_ctr as number);
  const branchCvrValues = Array.from(categoryMap.values())
    .filter(n => n.branch_clicks > 0 && n.branch_cvr !== null)
    .map(n => n.branch_cvr as number);
  const medianBranchCtr = computeMedian(branchCtrValues);
  const medianBranchCvr = computeMedian(branchCvrValues);

  for (const node of categoryMap.values()) {
    // Nodes with zero own impressions are pure parent/routing nodes — don't classify them
    node.health_status_node = node.node_impressions === 0
      ? null
      : classifyTier(
          node.node_ctr, node.node_cvr,
          node.node_impressions, node.node_clicks, node.node_conversions,
          medianNodeCtr, medianNodeCvr,
        );
    node.health_status_branch = classifyTier(
      node.branch_ctr, node.branch_cvr,
      node.branch_impressions, node.branch_clicks, node.branch_conversions,
      medianBranchCtr, medianBranchCvr,
    );
  }

  // Step 5: Calculate has_children and child_count
  const childCounts = new Map<string, number>();
  for (const node of categoryMap.values()) {
    if (node.parent_path) {
      childCounts.set(node.parent_path, (childCounts.get(node.parent_path) || 0) + 1);
    }
  }

  // Step 5: Delete old snapshots for this period
  await target.query(`
    DELETE FROM category_performance_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
  `, [retailerId, rangeStart, rangeEnd]);

  // Step 6: Insert all category nodes
  let insertedCount = 0;
  for (const node of categoryMap.values()) {
    const has_children = (childCounts.get(node.full_path) || 0) > 0;
    const child_count = childCounts.get(node.full_path) || 0;

    await target.query(`
      INSERT INTO category_performance_snapshots (
        retailer_id,
        range_type,
        range_start,
        range_end,
        category_level1,
        category_level2,
        category_level3,
        category_level4,
        category_level5,
        full_path,
        depth,
        parent_path,
        node_impressions,
        node_clicks,
        node_conversions,
        node_ctr,
        node_cvr,
        branch_impressions,
        branch_clicks,
        branch_conversions,
        branch_ctr,
        branch_cvr,
        has_children,
        child_count,
        health_status_node,
        health_status_branch
      ) VALUES (
        $1, 'month', $2, $3,
        $4, $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25
      )
    `, [
      retailerId,
      rangeStart,
      rangeEnd,
      node.level1,
      node.level2,
      node.level3,
      node.level4,
      node.level5,
      node.full_path,
      node.depth,
      node.parent_path,
      node.node_impressions,
      node.node_clicks,
      node.node_conversions,
      node.node_ctr,
      node.node_cvr,
      node.branch_impressions,
      node.branch_clicks,
      node.branch_conversions,
      node.branch_ctr,
      node.branch_cvr,
      has_children,
      child_count,
      node.health_status_node,
      node.health_status_branch,
    ]);
    insertedCount++;
  }

  return {
    domain: 'categories',
    retailerId,
    month: rangeStart.slice(0, 7),
    rowCount: insertedCount,
    operation: 'created',
  };
}

// ============================================================================
// Auction Snapshot Generator
// ============================================================================

/**
 * Generate auction insights snapshot for a retailer/month.
 *
 * Source data shape (auction_insights table):
 *   - Each row is ONE competitor for ONE campaign in ONE month.
 *   - Campaigns are identified by `campaign_name` matching 'octer-{retailer_id}~...'
 *   - `shop_display_name` is the competitor's display name.
 *   - `impr_share`      = competitor's own impression share (NOT ours).
 *   - `overlap_rate`    = how often they appeared in the same auction as Shareight.
 *   - `outranking_share`= how often Shareight ranked above them (high = opportunity,
 *                         low = they outrank us = threat).
 *
 * Aggregation strategy:
 *   - Pivot data is per-campaign, so we average across all matching campaigns per
 *     competitor to produce retailer-level competitor metrics.
 *   - `avg_impression_share` = AVG of our own impression share, derived from the
 *     campaign-level impr_share of the Shareight row. Because every row is a
 *     competitor entry, we approximate our impression share as the AVG impr_share
 *     from all rows (which represents the competitive field's average visibility).
 *     NOTE: This is a proxy — the source does not store a single "our impr_share"
 *     row; that would appear in Google Ads reports, not competitor auction data.
 */
async function generateAuctionSnapshot(monthData: MonthToProcess): Promise<SnapshotResult> {
  const source = getSourcePool();
  const target = getTargetPool();
  const { retailerId, rangeStart, rangeEnd } = monthData;

  // SOURCE: auction_insights uses monthly `month` column (first day of month),
  // not daily insight_date. We match on the month that overlaps rangeStart.
  const monthDate = rangeStart.slice(0, 7) + '-01'; // e.g. '2025-12-01'
  const campaignPrefix = `octer-${retailerId}~%`;

  // Step 1: Check data exists
  const checkResult = await source.query<{ row_count: string }>(`
    SELECT COUNT(*)::int AS row_count
    FROM auction_insights
    WHERE campaign_name LIKE $1
      AND month = $2
  `, [campaignPrefix, monthDate]);

  const rowCount = Number(checkResult.rows[0]?.row_count ?? 0);
  if (rowCount === 0) {
    return {
      domain: 'auctions',
      retailerId,
      month: rangeStart.slice(0, 7),
      rowCount: 0,
      operation: 'skipped',
    };
  }

  // Step 2: Aggregate competitors across all campaigns for this retailer/month.
  //   - Group by shop_display_name, average their metrics across campaigns.
  //   - This gives us a per-competitor summary for the whole retailer.
  const competitorsResult = await source.query<{
    shop_display_name: string;
    avg_overlap: string;
    avg_outranking: string;
    avg_impr_share: string;
    campaign_count: string;
  }>(`
    SELECT
      shop_display_name,
      AVG(overlap_rate::numeric)      AS avg_overlap,
      AVG(outranking_share::numeric)  AS avg_outranking,
      AVG(impr_share::numeric)        AS avg_impr_share,
      COUNT(DISTINCT campaign_name)   AS campaign_count
    FROM auction_insights
    WHERE campaign_name LIKE $1
      AND month = $2
    GROUP BY shop_display_name
    ORDER BY avg_overlap DESC NULLS LAST
  `, [campaignPrefix, monthDate]);

  const competitors = competitorsResult.rows;
  if (competitors.length === 0) {
    return {
      domain: 'auctions',
      retailerId,
      month: rangeStart.slice(0, 7),
      rowCount: 0,
      operation: 'skipped',
    };
  }

  // Step 3: Derive summary metrics
  const totalCompetitors = competitors.length;

  // avg_impression_share: proxy using the average competitor impr_share available.
  // In the auction report, impr_share reflects the competitor's market visibility.
  // We report this as the competitive field's average impression share so the
  // dashboard can show "market average" context.
  const withImprShare = competitors.filter(c => c.avg_impr_share != null);
  const avgImpressionShare = withImprShare.length > 0
    ? withImprShare.reduce((sum, c) => sum + Number(c.avg_impr_share), 0) / withImprShare.length
    : null;

  const avgOverlapRate = competitors.reduce((sum, c) => sum + Number(c.avg_overlap), 0) / totalCompetitors;
  const avgOutrankingShare = competitors.reduce((sum, c) => sum + Number(c.avg_outranking), 0) / totalCompetitors;

  // avg_being_outranked: approximated as 1 - avg_outranking for each competitor,
  // meaning on average how often they outrank us.
  const avgBeingOutranked = 1 - avgOutrankingShare;

  // Step 4: Classify competitors
  // Top competitor: highest overlap_rate (most frequent co-occurrence in same auction).
  const topCompetitor = competitors[0]; // Already sorted by avg_overlap DESC

  // Biggest threat: high overlap + lowest outranking_share (they often outrank us).
  // Score = overlap_rate * (1 - outranking_share): maximised when overlap is high
  // and we rarely outrank them.
  const biggestThreat = [...competitors].sort((a, b) => {
    const scoreA = Number(a.avg_overlap) * (1 - Number(a.avg_outranking));
    const scoreB = Number(b.avg_overlap) * (1 - Number(b.avg_outranking));
    return scoreB - scoreA;
  })[0];

  // Best opportunity: high overlap + high outranking_share (we already outrank them,
  // meaning we're winning visibility against them - opportunity to push further).
  const bestOpportunity = [...competitors].sort((a, b) => {
    const scoreA = Number(a.avg_overlap) * Number(a.avg_outranking);
    const scoreB = Number(b.avg_overlap) * Number(b.avg_outranking);
    return scoreB - scoreA;
  })[0];

  // Step 5: Build competitors JSONB payload (top 20 by overlap for UI)
  const topCompetitorsJson = competitors.slice(0, 20).map(c => ({
    id: c.shop_display_name,
    overlap_rate: Number(Number(c.avg_overlap).toFixed(4)),
    outranking_share: Number(Number(c.avg_outranking).toFixed(4)),
    impression_share: c.avg_impr_share != null ? Number(Number(c.avg_impr_share).toFixed(4)) : null,
    campaign_count: Number(c.campaign_count),
  }));

  // Step 6: Upsert into auction_insights_snapshots
  const n = (v: number | null) => v != null ? Number(v.toFixed(4)) : null;

  await target.query(`
    INSERT INTO auction_insights_snapshots (
      retailer_id, range_type, range_start, range_end, snapshot_date, last_updated,
      avg_impression_share, total_competitors,
      avg_overlap_rate, avg_outranking_share, avg_being_outranked,
      competitors,
      top_competitor_id, top_competitor_overlap_rate, top_competitor_outranking_you,
      biggest_threat_id, biggest_threat_overlap_rate, biggest_threat_outranking_you,
      best_opportunity_id, best_opportunity_overlap_rate, best_opportunity_you_outranking
    ) VALUES (
      $1, 'month', $2, $3, $4, NOW(),
      $5, $6,
      $7, $8, $9,
      $10,
      $11, $12, $13,
      $14, $15, $16,
      $17, $18, $19
    )
    ON CONFLICT (retailer_id, range_type, range_start, range_end)
    DO UPDATE SET
      last_updated             = EXCLUDED.last_updated,
      avg_impression_share     = EXCLUDED.avg_impression_share,
      total_competitors        = EXCLUDED.total_competitors,
      avg_overlap_rate         = EXCLUDED.avg_overlap_rate,
      avg_outranking_share     = EXCLUDED.avg_outranking_share,
      avg_being_outranked      = EXCLUDED.avg_being_outranked,
      competitors              = EXCLUDED.competitors,
      top_competitor_id        = EXCLUDED.top_competitor_id,
      top_competitor_overlap_rate    = EXCLUDED.top_competitor_overlap_rate,
      top_competitor_outranking_you  = EXCLUDED.top_competitor_outranking_you,
      biggest_threat_id              = EXCLUDED.biggest_threat_id,
      biggest_threat_overlap_rate    = EXCLUDED.biggest_threat_overlap_rate,
      biggest_threat_outranking_you  = EXCLUDED.biggest_threat_outranking_you,
      best_opportunity_id            = EXCLUDED.best_opportunity_id,
      best_opportunity_overlap_rate  = EXCLUDED.best_opportunity_overlap_rate,
      best_opportunity_you_outranking = EXCLUDED.best_opportunity_you_outranking
  `, [
    retailerId, rangeStart, rangeEnd, rangeStart, // snapshot_date = rangeStart
    n(avgImpressionShare), totalCompetitors,
    n(avgOverlapRate), n(avgOutrankingShare), n(avgBeingOutranked),
    JSON.stringify(topCompetitorsJson),
    topCompetitor.shop_display_name, n(Number(topCompetitor.avg_overlap)), n(Number(topCompetitor.avg_outranking)),
    biggestThreat.shop_display_name, n(Number(biggestThreat.avg_overlap)), n(Number(biggestThreat.avg_outranking)),
    bestOpportunity.shop_display_name, n(Number(bestOpportunity.avg_overlap)), n(Number(bestOpportunity.avg_outranking)),
  ]);

  return {
    domain: 'auctions',
    retailerId,
    month: rangeStart.slice(0, 7),
    rowCount: 1,
    operation: 'created',
  };
}

async function generateProductSnapshot(monthData: MonthToProcess): Promise<SnapshotResult> {
  const source = getSourcePool();
  const target = getTargetPool();
  const { retailerId, rangeStart, rangeEnd } = monthData;

  // Step 1: Get overall aggregate metrics
  const aggregateResult = await source.query(`
    SELECT
      COUNT(*)::int AS row_count,
      COUNT(DISTINCT item_id)::int AS total_products,
      COALESCE(SUM(impressions), 0)::bigint AS total_impressions,
      COALESCE(SUM(clicks), 0)::bigint AS total_clicks,
      COALESCE(SUM(conversions), 0)::numeric AS total_conversions,
      AVG(ctr)::numeric AS avg_ctr,
      AVG(cvr)::numeric AS avg_cvr,
      COUNT(DISTINCT item_id) FILTER (WHERE conversions > 0)::int AS products_with_conversions,
      COUNT(DISTINCT item_id) FILTER (WHERE clicks > 0 AND conversions = 0)::int AS products_with_clicks_no_conversions,
      COALESCE(SUM(clicks) FILTER (WHERE conversions = 0), 0)::bigint AS clicks_without_conversions
    FROM product_performance
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
  `, [retailerId, rangeStart, rangeEnd]);

  const aggregate = aggregateResult.rows[0];
  if (!aggregate || Number(aggregate.row_count) === 0) {
    return {
      domain: 'products',
      retailerId,
      month: rangeStart.slice(0, 7),
      rowCount: 0,
      operation: 'skipped',
    };
  }

  // Step 2: Aggregate products by item_id for classification
  const productsAggregated = await source.query(`
    SELECT
      item_id,
      MAX(product_title) as product_title,
      SUM(impressions)::bigint as total_impressions,
      SUM(clicks)::bigint as total_clicks,
      SUM(conversions)::numeric as total_conversions,
      CASE WHEN SUM(impressions) > 0 
        THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 
        ELSE 0 
      END as ctr,
      CASE WHEN SUM(clicks) > 0 
        THEN (SUM(conversions)::numeric / SUM(clicks)) * 100 
        ELSE 0 
      END as cvr
    FROM product_performance
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
    GROUP BY item_id
  `, [retailerId, rangeStart, rangeEnd]);

  const products = productsAggregated.rows;

  // Step 3: Classification 1 - Top Converters
  // Products with conversions, ordered by CVR, take top 500 OR top 50% of all conversions
  const productsWithConversions = products.filter(p => Number(p.total_conversions) > 0);
  const totalConversions = Number(aggregate.total_conversions);
  let topConverters: any[] = [];
  
  if (productsWithConversions.length > 0) {
    const sortedByConversionRate = [...productsWithConversions].sort((a, b) => Number(b.cvr) - Number(a.cvr));
    
    // Calculate top 50% of conversions
    let cumulativeConversions = 0;
    let top50PctIndex = 0;
    for (let i = 0; i < sortedByConversionRate.length; i++) {
      cumulativeConversions += Number(sortedByConversionRate[i].total_conversions);
      top50PctIndex = i;
      if (cumulativeConversions >= totalConversions * 0.5) {
        break;
      }
    }
    
    // Take either top 500 or products that make up top 50% of conversions, whichever is smaller
    const topConvertersCount = Math.min(500, top50PctIndex + 1);
    topConverters = sortedByConversionRate.slice(0, topConvertersCount).map(p => ({
      item_id: p.item_id,
      product_title: p.product_title,
      impressions: Number(p.total_impressions),
      clicks: Number(p.total_clicks),
      conversions: Number(Number(p.total_conversions).toFixed(2)),
      ctr: Number(Number(p.ctr).toFixed(2)),
      cvr: Number(Number(p.cvr).toFixed(2))
    }));
  }

  // Step 4: Classification 2 - Lowest Converters  
  // Products with 0 conversions, ordered by clicks desc, top 200
  const lowestConverters = products
    .filter(p => Number(p.total_conversions) === 0 && Number(p.total_clicks) > 0)
    .sort((a, b) => Number(b.total_clicks) - Number(a.total_clicks))
    .slice(0, 200)
    .map(p => ({
      item_id: p.item_id,
      product_title: p.product_title,
      impressions: Number(p.total_impressions),
      clicks: Number(p.total_clicks),
      conversions: 0,
      ctr: Number(Number(p.ctr).toFixed(2)),
      cvr: 0
    }));

  // Step 5: Classification 3 - Top Click-Through
  // Products with highest CTR, ordered by impressions desc, top 500
  const topClickThrough = products
    .filter(p => Number(p.total_impressions) > 0 && Number(p.total_clicks) > 0)
    .sort((a, b) => {
      // Primary sort: CTR descending
      const ctrDiff = Number(b.ctr) - Number(a.ctr);
      if (Math.abs(ctrDiff) > 0.01) return ctrDiff;
      // Secondary sort: Impressions descending (for ties in CTR)
      return Number(b.total_impressions) - Number(a.total_impressions);
    })
    .slice(0, 500)
    .map(p => ({
      item_id: p.item_id,
      product_title: p.product_title,
      impressions: Number(p.total_impressions),
      clicks: Number(p.total_clicks),
      conversions: Number(Number(p.total_conversions).toFixed(2)),
      ctr: Number(Number(p.ctr).toFixed(2)),
      cvr: Number(Number(p.cvr).toFixed(2))
    }));

  // Step 6: Classification 4 - High Impressions No Clicks
  // Products with most impressions but 0 clicks, top 200
  const highImpressionsNoClicks = products
    .filter(p => Number(p.total_impressions) > 0 && Number(p.total_clicks) === 0)
    .sort((a, b) => Number(b.total_impressions) - Number(a.total_impressions))
    .slice(0, 200)
    .map(p => ({
      item_id: p.item_id,
      product_title: p.product_title,
      impressions: Number(p.total_impressions),
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cvr: 0
    }));

  // Build product_classifications JSONB with all 4 groups
  const productClassifications = {
    top_converters: topConverters,
    lowest_converters: lowestConverters,
    top_click_through: topClickThrough,
    high_impressions_no_clicks: highImpressionsNoClicks,
  };

  // Step 7: Insert/update snapshot with aggregates and classifications
  const upsertResult = await target.query(`
    INSERT INTO product_performance_snapshots (
      retailer_id,
      range_type,
      range_start,
      range_end,
      total_products,
      total_impressions,
      total_clicks,
      total_conversions,
      avg_ctr,
      avg_cvr,
      products_with_conversions,
      products_with_clicks_no_conversions,
      clicks_without_conversions,
      product_classifications
    ) VALUES (
      $1, 'month', $2, $3,
      $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    ON CONFLICT (retailer_id, range_type, range_start, range_end)
    DO UPDATE SET
      total_products = EXCLUDED.total_products,
      total_impressions = EXCLUDED.total_impressions,
      total_clicks = EXCLUDED.total_clicks,
      total_conversions = EXCLUDED.total_conversions,
      avg_ctr = EXCLUDED.avg_ctr,
      avg_cvr = EXCLUDED.avg_cvr,
      products_with_conversions = EXCLUDED.products_with_conversions,
      products_with_clicks_no_conversions = EXCLUDED.products_with_clicks_no_conversions,
      clicks_without_conversions = EXCLUDED.clicks_without_conversions,
      product_classifications = EXCLUDED.product_classifications,
      last_updated = NOW()
    RETURNING (xmax = 0) AS inserted
  `, [
    retailerId,
    rangeStart,
    rangeEnd,
    aggregate.total_products,
    aggregate.total_impressions,
    aggregate.total_clicks,
    aggregate.total_conversions,
    aggregate.avg_ctr,
    aggregate.avg_cvr,
    aggregate.products_with_conversions,
    aggregate.products_with_clicks_no_conversions,
    aggregate.clicks_without_conversions,
    JSON.stringify(productClassifications),
  ]);

  const inserted = upsertResult.rows[0]?.inserted === true;

  return {
    domain: 'products',
    retailerId,
    month: rangeStart.slice(0, 7),
    rowCount: Number(aggregate.total_products),
    operation: inserted ? 'created' : 'updated',
  };
}

// ============================================================================
// Snapshot Generation (Orchestration)
// ============================================================================

/**
 * Main entry point for snapshot generation
 */
export async function generateSnapshots(options: GeneratorOptions = {}): Promise<SnapshotResult[]> {
  console.log('========================================');
  console.log('Snapshot Generator');
  console.log('========================================');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Source DB: ${SOURCE_DB_MODE} (${SOURCE_DB_CONFIG.host}:${SOURCE_DB_CONFIG.port})`);
  if (options.retailer) console.log(`Retailer: ${options.retailer}`);
  if (options.month) console.log(`Month: ${options.month}`);
  console.log('========================================\n');
  
  try {
    // Get enabled retailers
    const retailers = await getEnabledRetailers(options);
    console.log(`Found ${retailers.length} enabled retailer(s):`);
    retailers.forEach(r => console.log(`  - ${r.retailerId} (${r.retailerName})`));
    console.log('');
    
    if (retailers.length === 0) {
      console.log('No enabled retailers found. Exiting.');
      return [];
    }
    
    const results: SnapshotResult[] = [];
    
    // Process each retailer
    for (const retailer of retailers) {
      console.log(`\nProcessing ${retailer.retailerId}...`);
      
      // Identify months to process
      const months = await identifyMonthsToProcess(retailer.retailerId, options);
      console.log(`  Found ${months.length} month(s) to process`);
      
      if (months.length === 0) {
        console.log('  All snapshots up to date');
        continue;
      }
      
      // Process each month
      for (const monthData of months) {
        const monthStr = `${monthData.year}-${monthData.month.toString().padStart(2, '0')}`;
        console.log(`\n  Month: ${monthStr}`);
        console.log(`    Range: ${monthData.rangeStart} to ${monthData.rangeEnd}`);
        console.log(`    Source updated: ${monthData.lastFetchDatetime.toISOString()}`);
        
        if (options.dryRun) {
          console.log('    [DRY RUN] Previewing what would be generated...\n');
          await previewKeywordSnapshot(monthData);
          continue;
        }
        
        // Generate snapshots for each domain
        console.log('    Generating snapshots...');
        const keywordResult = await generateKeywordSnapshot(monthData);
        const categoryResult = await generateCategorySnapshot(monthData);
        const productResult = await generateProductSnapshot(monthData);
        const auctionResult = await generateAuctionSnapshot(monthData);

        results.push(keywordResult, categoryResult, productResult, auctionResult);

        console.log(`      Keywords: ${keywordResult.operation} (${keywordResult.rowCount} keywords)`);
        console.log(`      Categories: ${categoryResult.operation} (${categoryResult.rowCount} categories)`);
        console.log(`      Products: ${productResult.operation} (${productResult.rowCount} products)`);
        console.log(`      Auctions: ${auctionResult.operation} (${auctionResult.rowCount === 1 ? `${auctionResult.rowCount} snapshot` : 'no data'})`);
        console.log('      Coverage: skipped (source data not available yet)');
      }
    }
    
    console.log('\n========================================');
    console.log('Snapshot generation complete');
    console.log(`Total snapshots: ${results.length}`);
    console.log('========================================');
    
    return results;
    
  } catch (error) {
    console.error('Error generating snapshots:', error);
    throw error;
  } finally {
    await closePools();
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: GeneratorOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--retailer=')) {
      options.retailer = arg.split('=')[1];
    } else if (arg === '--retailer' && i + 1 < args.length) {
      options.retailer = args[++i];
    } else if (arg.startsWith('--month=')) {
      options.month = arg.split('=')[1];
    } else if (arg === '--month' && i + 1 < args.length) {
      options.month = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    }
  }
  
  generateSnapshots(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
