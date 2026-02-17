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
import { Pool } from 'pg';

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../../.env.local') });

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
    
    // Process if no snapshot exists OR source is newer
    if (!snapshotLastUpdated || sourceFetchDatetime > new Date(snapshotLastUpdated)) {
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

  const aggregateResult = await source.query(`
    SELECT
      COUNT(*)::int AS row_count,
      COUNT(DISTINCT CONCAT_WS('>', category_level1, category_level2, category_level3, category_level4, category_level5))::int
        AS total_categories,
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
    FROM category_performance
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
  `, [retailerId, rangeStart, rangeEnd]);

  const aggregate = aggregateResult.rows[0];
  if (!aggregate || Number(aggregate.row_count) === 0) {
    return {
      domain: 'categories',
      retailerId,
      month: rangeStart.slice(0, 7),
      rowCount: 0,
      operation: 'skipped',
    };
  }

  const upsertResult = await target.query(`
    INSERT INTO category_performance_snapshots (
      retailer_id,
      range_type,
      range_start,
      range_end,
      total_categories,
      total_impressions,
      total_clicks,
      total_conversions,
      overall_ctr,
      overall_cvr
    ) VALUES (
      $1, 'month', $2, $3,
      $4, $5, $6, $7, $8, $9
    )
    ON CONFLICT (retailer_id, range_type, range_start, range_end)
    DO UPDATE SET
      total_categories = EXCLUDED.total_categories,
      total_impressions = EXCLUDED.total_impressions,
      total_clicks = EXCLUDED.total_clicks,
      total_conversions = EXCLUDED.total_conversions,
      overall_ctr = EXCLUDED.overall_ctr,
      overall_cvr = EXCLUDED.overall_cvr,
      last_updated = NOW()
    RETURNING (xmax = 0) AS inserted
  `, [
    retailerId,
    rangeStart,
    rangeEnd,
    aggregate.total_categories,
    aggregate.total_impressions,
    aggregate.total_clicks,
    aggregate.total_conversions,
    aggregate.overall_ctr,
    aggregate.overall_cvr,
  ]);

  const inserted = upsertResult.rows[0]?.inserted === true;

  return {
    domain: 'categories',
    retailerId,
    month: rangeStart.slice(0, 7),
    rowCount: Number(aggregate.total_categories),
    operation: inserted ? 'created' : 'updated',
  };
}

async function generateProductSnapshot(monthData: MonthToProcess): Promise<SnapshotResult> {
  const source = getSourcePool();
  const target = getTargetPool();
  const { retailerId, rangeStart, rangeEnd } = monthData;

  const aggregateResult = await source.query(`
    SELECT
      COUNT(*)::int AS row_count,
      COUNT(DISTINCT item_id)::int AS total_products,
      COALESCE(SUM(conversions), 0)::numeric AS total_conversions,
      AVG(ctr)::numeric AS avg_ctr,
      AVG(cvr)::numeric AS avg_cvr
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

  const upsertResult = await target.query(`
    INSERT INTO product_performance_snapshots (
      retailer_id,
      range_type,
      range_start,
      range_end,
      total_products,
      total_conversions,
      avg_ctr,
      avg_cvr
    ) VALUES (
      $1, 'month', $2, $3,
      $4, $5, $6, $7
    )
    ON CONFLICT (retailer_id, range_type, range_start, range_end)
    DO UPDATE SET
      total_products = EXCLUDED.total_products,
      total_conversions = EXCLUDED.total_conversions,
      avg_ctr = EXCLUDED.avg_ctr,
      avg_cvr = EXCLUDED.avg_cvr,
      last_updated = NOW()
    RETURNING (xmax = 0) AS inserted
  `, [
    retailerId,
    rangeStart,
    rangeEnd,
    aggregate.total_products,
    aggregate.total_conversions,
    aggregate.avg_ctr,
    aggregate.avg_cvr,
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

        results.push(keywordResult, categoryResult, productResult);

        console.log(`      Keywords: ${keywordResult.operation} (${keywordResult.rowCount} keywords)`);
        console.log(`      Categories: ${categoryResult.operation} (${categoryResult.rowCount} categories)`);
        console.log(`      Products: ${productResult.operation} (${productResult.rowCount} products)`);
        console.log('      Auctions: skipped (source data not available yet)');
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
    }
  }
  
  generateSnapshots(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
