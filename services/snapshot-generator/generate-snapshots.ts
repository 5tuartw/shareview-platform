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
import {
  BRAND_SPLIT_CLASSIFICATION_VALUES,
  BRAND_SPLIT_SCOPE_VALUES,
  classifySearchTermByBrandSplit,
  normaliseBrandSplitText,
  type BrandSplitClassification,
  type BrandSplitScope,
  type BrandSplitVocabularyEntry,
} from '../../lib/keyword-brand-splits';
import {
  resolveAllKeywordThresholds,
  type ResolvedKeywordThresholds,
} from '../../lib/keyword-threshold-config';

// ============================================================================
// Types
// ============================================================================

interface RetailerConfig {
  retailerId: string;
  retailerName: string;
  sourceRetailerId: string | null;
  snapshotEnabled: boolean;
  defaultRanges: string[];
  detailLevel: 'summary' | 'detail' | 'full';
}

interface MonthToProcess {
  retailerId: string;
  sourceRetailerId: string;  // Analytics source DB identifier
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
  retailerConcurrency?: number;
  domainParallel?: boolean;
  /** When set, only generate snapshots for the specified domains (e.g. ['keywords']) */
  domains?: Array<'keywords' | 'categories' | 'products'>;
}

interface SnapshotResult {
  domain: string;
  retailerId: string;
  month: string;
  rowCount: number;
  operation: 'created' | 'updated' | 'skipped';
}

interface KeywordWordAnalysisSummary {
  total_words: number;
  star_words: number;
  good_words: number;
  dead_words: number;
  poor_words: number;
  average_words: number;
  total_conversions: number;
  total_clicks: number;
  wasted_clicks: number;
  analysis_date: string | null;
}

interface BrandSplitAggregatedKeywordRow {
  search_term: string;
  total_impressions: string | number;
  total_clicks: string | number;
  total_conversions: string | number;
  ctr: string | number | null;
  cvr: string | number | null;
}

interface BrandSplitSummaryBucket {
  search_terms: number;
  impressions: number;
  clicks: number;
  conversions: number;
  share_of_total_conversions_pct: number;
}

interface AggregatedBrandSplitTermRow {
  searchTerm: string;
  normalizedSearchTerm: string;
  classification: BrandSplitClassification;
  matchedAliases: string[];
  matchedLabels: string[];
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cvr: number | null;
}

// ============================================================================
// Configuration
// ============================================================================

const SOURCE_DB_MODE = process.env.SOURCE_DB_MODE || 'tunnel'; // 'direct' or 'tunnel'
const DEFAULT_RETAILER_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.SNAPSHOT_RETAILER_CONCURRENCY || '4', 10)
);
const DEFAULT_DOMAIN_PARALLEL = process.env.SNAPSHOT_PARALLEL_DOMAINS !== '0';

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

// Quadrant limits are not per-tier (same for all retailers)
const KEYWORD_QUADRANT_LIMITS = {
  LIMIT_WINNERS: 150,
  LIMIT_CSS_WINS_RETAILER_LOSES: 100,
  LIMIT_HIDDEN_GEMS: 150,
  LIMIT_POOR_PERFORMERS: 100,
} as const;

/** Wraps a pg Pool so it can be passed to lib functions that expect QueryExecutor */
function poolAsQueryExecutor(pool: Pool) {
  return {
    query: <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
      pool.query<T & import('pg').QueryResultRow>(text, params as (string | number | boolean | null | undefined)[]),
  };
}

// Resolved thresholds are loaded from DB at runtime; this is the in-memory cache.
let resolvedKeywordDefaults: ResolvedKeywordThresholds | null = null;
let resolvedKeywordOverrides: Map<string, ResolvedKeywordThresholds> | null = null;

async function loadKeywordThresholds(): Promise<void> {
  const target = getTargetPool();
  const { defaults, overrides } = await resolveAllKeywordThresholds(poolAsQueryExecutor(target));
  resolvedKeywordDefaults = defaults;
  resolvedKeywordOverrides = overrides;
  console.log(`  Loaded keyword thresholds: default tier + ${overrides.size} retailer override(s)`);
}

function getKeywordThresholdsForRetailer(retailerId: string): ResolvedKeywordThresholds {
  if (resolvedKeywordOverrides?.has(retailerId)) {
    return resolvedKeywordOverrides.get(retailerId)!;
  }
  return resolvedKeywordDefaults ?? {
    min_impressions: 50,
    min_clicks: 5,
    fallback_min_impressions: 30,
    fallback_min_clicks: 3,
    low_volume_trigger_qualified: 30,
    low_volume_trigger_positive: 20,
  };
}

const BRAND_SPLIT_MAX_TERMS_PER_CLASSIFICATION = 100;

interface KeywordQualificationContext {
  qualifiedCount: number;
  positiveCount: number;
  medianCtr: number;
  minImpressions: number;
  minClicks: number;
  fallbackApplied: boolean;
  fallbackReason: 'qualified_count' | 'positive_count' | 'both' | null;
}

async function getKeywordQualificationContext(
  source: Pool,
  sourceRetailerId: string,
  rangeStart: string,
  rangeEnd: string,
  thresholds: ResolvedKeywordThresholds,
): Promise<KeywordQualificationContext> {
  const runQualificationQuery = async (minImpressions: number, minClicks: number) => {
    const result = await source.query(`
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
      ),
      stats AS (
        SELECT
          COUNT(*)::int as qualified_count,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ctr)::numeric as median_ctr
        FROM aggregated
      )
      SELECT
        COALESCE(stats.qualified_count, 0)::int as qualified_count,
        COALESCE(stats.median_ctr, 0)::numeric as median_ctr,
        COALESCE((
          SELECT COUNT(*)::int
          FROM aggregated a
          WHERE a.total_conversions > 0
        ), 0)::int as positive_count
      FROM stats
    `, [sourceRetailerId, rangeStart, rangeEnd, minImpressions, minClicks]);

    return {
      qualifiedCount: Number(result.rows[0]?.qualified_count || 0),
      positiveCount: Number(result.rows[0]?.positive_count || 0),
      medianCtr: Number(result.rows[0]?.median_ctr || 0),
      minImpressions,
      minClicks,
      fallbackApplied: false,
      fallbackReason: null,
    };
  };

  const baseline = await runQualificationQuery(
    thresholds.min_impressions,
    thresholds.min_clicks,
  );

  const qualifiedTriggerMet =
    baseline.qualifiedCount < thresholds.low_volume_trigger_qualified;
  const positiveTriggerMet =
    baseline.positiveCount < thresholds.low_volume_trigger_positive;

  if (
    (!qualifiedTriggerMet && !positiveTriggerMet) ||
    thresholds.fallback_min_impressions >= thresholds.min_impressions ||
    thresholds.fallback_min_clicks >= thresholds.min_clicks
  ) {
    return baseline;
  }

  const fallback = await runQualificationQuery(
    thresholds.fallback_min_impressions,
    thresholds.fallback_min_clicks,
  );

  return {
    ...fallback,
    fallbackApplied: true,
    fallbackReason: qualifiedTriggerMet && positiveTriggerMet
      ? 'both'
      : qualifiedTriggerMet
        ? 'qualified_count'
        : 'positive_count',
  };
}

const CATEGORY_INSERT_CHUNK_SIZE = 500;
const WORD_ANALYSIS_INSERT_CHUNK_SIZE = 500;
const BRAND_SPLIT_INSERT_CHUNK_SIZE = 500;

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

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );

  return result.rows[0]?.exists === true;
}

function dedupeVocabulary(entries: BrandSplitVocabularyEntry[]): BrandSplitVocabularyEntry[] {
  const seen = new Set<string>();
  const result: BrandSplitVocabularyEntry[] = [];

  for (const entry of entries) {
    const phrase = normaliseBrandSplitText(entry.phrase);
    if (!phrase) continue;

    const key = `${entry.kind}:${entry.brandId ?? 'none'}:${phrase}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      ...entry,
      phrase,
    });
  }

  return result.sort((left, right) => right.phrase.length - left.phrase.length);
}

async function getBrandSplitVocabularies(
  target: Pool,
  retailerId: string,
): Promise<Record<BrandSplitScope, BrandSplitVocabularyEntry[]>> {
  const retailerResult = await target.query<{ retailer_name: string }>(
    `SELECT retailer_name FROM retailers WHERE retailer_id = $1 LIMIT 1`,
    [retailerId]
  );

  const retailerName = retailerResult.rows[0]?.retailer_name ?? '';
  const retailerEntries: BrandSplitVocabularyEntry[] = retailerName
    ? [{ phrase: retailerName, label: retailerName, kind: 'retailer' }]
    : [];

  if (await tableExists(target, 'retailer_aliases')) {
    const aliasResult = await target.query<{ alias_name: string }>(
      `SELECT alias_name
       FROM retailer_aliases
       WHERE retailer_id = $1
         AND is_active = true
       ORDER BY alias_name ASC`,
      [retailerId]
    );

    retailerEntries.push(
      ...aliasResult.rows.map((row) => ({
        phrase: row.alias_name,
        label: row.alias_name,
        kind: 'retailer' as const,
      }))
    );
  }

  const ownedEntries: BrandSplitVocabularyEntry[] = [];
  const stockedEntries: BrandSplitVocabularyEntry[] = [];

  const hasBrandTables =
    (await tableExists(target, 'brands')) &&
    (await tableExists(target, 'brand_aliases')) &&
    (await tableExists(target, 'retailer_brand_presence'));

  if (hasBrandTables) {
    const brandResult = await target.query<{
      brand_id: string;
      canonical_name: string;
      brand_type: string | null;
      brand_type_retailer_id: string | null;
      alias_name: string | null;
    }>(
      `SELECT DISTINCT
          b.brand_id::text,
          b.canonical_name,
          b.brand_type,
          b.brand_type_retailer_id,
          ba.alias_name
       FROM retailer_brand_presence rbp
       INNER JOIN brands b ON b.brand_id = rbp.brand_id
       LEFT JOIN brand_aliases ba ON ba.brand_id = b.brand_id
       WHERE rbp.retailer_id = $1
         AND rbp.is_current = true
         AND b.status = 'active'`,
      [retailerId]
    );

    for (const row of brandResult.rows) {
      const baseEntry = {
        label: row.canonical_name,
        kind: 'brand' as const,
        brandId: Number(row.brand_id),
        brandType: row.brand_type,
      };

      const phrases = [row.canonical_name, row.alias_name].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      );

      const isOwnedByRetailer =
        row.brand_type_retailer_id === retailerId && row.brand_type !== '3rd_party';

      for (const phrase of phrases) {
        const entry = { ...baseEntry, phrase };
        stockedEntries.push(entry);

        if (isOwnedByRetailer) {
          ownedEntries.push(entry);
        }
      }
    }
  }

  return {
    retailer: dedupeVocabulary(retailerEntries),
    retailer_and_owned: dedupeVocabulary([...retailerEntries, ...ownedEntries]),
    retailer_owned_and_stocked: dedupeVocabulary([...retailerEntries, ...ownedEntries, ...stockedEntries]),
  };
}

function emptyBrandSplitSummaryBucket(): BrandSplitSummaryBucket {
  return {
    search_terms: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    share_of_total_conversions_pct: 0,
  };
}

function buildBrandSplitSummary(
  rows: Array<{ classification: BrandSplitClassification; impressions: number; clicks: number; conversions: number }>,
  totalConversions: number,
): Record<BrandSplitClassification, BrandSplitSummaryBucket> {
  const summary = Object.fromEntries(
    BRAND_SPLIT_CLASSIFICATION_VALUES.map((classification) => [classification, emptyBrandSplitSummaryBucket()])
  ) as Record<BrandSplitClassification, BrandSplitSummaryBucket>;

  for (const row of rows) {
    const bucket = summary[row.classification];
    bucket.search_terms += 1;
    bucket.impressions += row.impressions;
    bucket.clicks += row.clicks;
    bucket.conversions += row.conversions;
  }

  for (const classification of BRAND_SPLIT_CLASSIFICATION_VALUES) {
    const bucket = summary[classification];
    bucket.share_of_total_conversions_pct =
      totalConversions > 0 ? Number(((bucket.conversions / totalConversions) * 100).toFixed(4)) : 0;
  }

  return summary;
}

function aggregateBrandSplitTerms(rows: AggregatedBrandSplitTermRow[]): AggregatedBrandSplitTermRow[] {
  const aggregated = new Map<string, AggregatedBrandSplitTermRow>();

  for (const row of rows) {
    const key = row.normalizedSearchTerm;
    const existing = aggregated.get(key);

    if (!existing) {
      aggregated.set(key, {
        ...row,
        matchedAliases: [...row.matchedAliases],
        matchedLabels: [...row.matchedLabels],
      });
      continue;
    }

    const impressions = existing.impressions + row.impressions;
    const clicks = existing.clicks + row.clicks;
    const conversions = existing.conversions + row.conversions;

    aggregated.set(key, {
      searchTerm:
        row.conversions > existing.conversions ||
        (row.conversions === existing.conversions && row.clicks > existing.clicks)
          ? row.searchTerm
          : existing.searchTerm,
      normalizedSearchTerm: key,
      classification:
        existing.classification === 'brand_and_term' || row.classification === 'brand_and_term'
          ? 'brand_and_term'
          : existing.classification === 'brand_only' || row.classification === 'brand_only'
            ? 'brand_only'
            : 'generic',
      matchedAliases: Array.from(new Set([...existing.matchedAliases, ...row.matchedAliases])).sort(),
      matchedLabels: Array.from(new Set([...existing.matchedLabels, ...row.matchedLabels])).sort(),
      impressions,
      clicks,
      conversions,
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(4)) : null,
      cvr: clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(4)) : null,
    });
  }

  return Array.from(aggregated.values());
}

function limitBrandSplitDetailRows(rows: AggregatedBrandSplitTermRow[]): AggregatedBrandSplitTermRow[] {
  return BRAND_SPLIT_CLASSIFICATION_VALUES.flatMap((classification) => {
    return rows
      .filter((row) => row.classification === classification)
      .sort((left, right) => {
        if (right.conversions !== left.conversions) return right.conversions - left.conversions;
        if (right.clicks !== left.clicks) return right.clicks - left.clicks;
        return left.searchTerm.localeCompare(right.searchTerm);
      })
      .slice(0, BRAND_SPLIT_MAX_TERMS_PER_CLASSIFICATION);
  });
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
      COALESCE(NULLIF(source_retailer_id, ''), retailer_id) AS source_retailer_id,
      snapshot_enabled,
      snapshot_default_ranges as default_ranges,
      snapshot_detail_level as detail_level
    FROM retailers
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
    sourceRetailerId: row.source_retailer_id ?? null,
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
  sourceRetailerId: string,
  options: GeneratorOptions
): Promise<MonthToProcess[]> {
  const sourcePool = getSourcePool();
  const targetPool = getTargetPool();

  const getLatestSnapshotUpdatedAt = async (rangeStart: string, rangeEnd: string): Promise<Date | null> => {
    const snapshotTables = [
      'keywords_snapshots',
      'category_performance_snapshots',
      'product_performance_snapshots',
    ];

    if (await tableExists(targetPool, 'keyword_word_analysis_snapshots')) {
      snapshotTables.push('keyword_word_analysis_snapshots');
    }

    if (await tableExists(targetPool, 'keyword_brand_split_snapshots')) {
      snapshotTables.push('keyword_brand_split_snapshots');
    }

    const unionSql = snapshotTables.map((tableName) => `
        SELECT '${tableName}'::text AS table_name,
               COUNT(*)::int AS row_count,
               MAX(last_updated)::text AS latest_snapshot_updated_at
        FROM ${tableName}
        WHERE retailer_id = $1
          AND range_type = 'month'
          AND range_start = $2
          AND range_end = $3
      `).join('\nUNION ALL\n');

    const snapshotResult = await targetPool.query<{
      table_name: string;
      row_count: string | number;
      latest_snapshot_updated_at: string | null;
    }>(unionSql, [retailerId, rangeStart, rangeEnd]);

    const hasMissingSnapshotTable = snapshotResult.rows.some((row) => Number(row.row_count || 0) === 0);
    if (hasMissingSnapshotTable) {
      return null;
    }

    const latestSnapshotUpdatedAt = snapshotResult.rows.reduce<Date | null>((latest, row) => {
      if (!row.latest_snapshot_updated_at) return latest;
      const candidate = new Date(row.latest_snapshot_updated_at);
      if (!latest || candidate > latest) return candidate;
      return latest;
    }, null);

    return latestSnapshotUpdatedAt;
  };
  
  // Use row activity time for freshness (not only fetch_datetime):
  // some source upserts update data fields and updated_at without changing fetch_datetime.
  const sourceActivityExpr = `
    GREATEST(
      COALESCE(updated_at, TIMESTAMP 'epoch'),
      COALESCE(fetch_datetime, TIMESTAMP 'epoch')
    )
  `;

  // If specific month requested, process only that month if source data exists and is newer
  // than the latest existing snapshot for the same period (unless force is set).
  if (options.month) {
    const [year, month] = options.month.split('-').map(Number);
    const rangeStart = `${year}-${month.toString().padStart(2, '0')}-01`;
    const rangeEnd = getMonthEnd(year, month);
    const sourceResult = await sourcePool.query<{ last_fetch: string | null }>(`
      SELECT MAX(last_fetch)::text AS last_fetch
      FROM (
        SELECT MAX(${sourceActivityExpr}) AS last_fetch
        FROM keywords
        WHERE retailer_id = $1
          AND insight_date BETWEEN $2 AND $3

        UNION ALL

        SELECT MAX(${sourceActivityExpr}) AS last_fetch
        FROM category_performance
        WHERE retailer_id = $1
          AND insight_date BETWEEN $2 AND $3

        UNION ALL

        SELECT MAX(${sourceActivityExpr}) AS last_fetch
        FROM product_performance
        WHERE retailer_id = $1
          AND insight_date BETWEEN $2 AND $3
      ) domain_fetches
    `, [sourceRetailerId, rangeStart, rangeEnd]);

    if (!sourceResult.rows[0]?.last_fetch) {
      console.log(`No source data for ${retailerId} ${options.month}`);
      return [];
    }

    const sourceFetchDatetime = new Date(sourceResult.rows[0].last_fetch);
    const latestSnapshotUpdatedAt = await getLatestSnapshotUpdatedAt(rangeStart, rangeEnd);

    if (!options.force && latestSnapshotUpdatedAt && sourceFetchDatetime <= latestSnapshotUpdatedAt) {
      return [];
    }

    return [{
      retailerId,
      sourceRetailerId,
      year,
      month,
      rangeStart,
      rangeEnd,
      lastFetchDatetime: sourceFetchDatetime,
    }];
  }

  // Otherwise, auto-detect months with data in source and process only when
  // source is newer than the latest snapshot for the period.
  const sourceResult = await sourcePool.query(`
    SELECT
      year,
      month,
      MAX(last_fetch) AS last_fetch
    FROM (
      SELECT
        EXTRACT(YEAR FROM insight_date)::int AS year,
        EXTRACT(MONTH FROM insight_date)::int AS month,
        MAX(${sourceActivityExpr}) AS last_fetch
      FROM keywords
      WHERE retailer_id = $1
      GROUP BY 1, 2

      UNION ALL

      SELECT
        EXTRACT(YEAR FROM insight_date)::int AS year,
        EXTRACT(MONTH FROM insight_date)::int AS month,
        MAX(${sourceActivityExpr}) AS last_fetch
      FROM category_performance
      WHERE retailer_id = $1
      GROUP BY 1, 2

      UNION ALL

      SELECT
        EXTRACT(YEAR FROM insight_date)::int AS year,
        EXTRACT(MONTH FROM insight_date)::int AS month,
        MAX(${sourceActivityExpr}) AS last_fetch
      FROM product_performance
      WHERE retailer_id = $1
      GROUP BY 1, 2
    ) all_domain_months
    GROUP BY year, month
    ORDER BY 1 DESC, 2 DESC
  `, [sourceRetailerId]);

  const monthsToProcess: MonthToProcess[] = [];

  for (const row of sourceResult.rows) {
    const year = parseInt(row.year);
    const month = parseInt(row.month);

    const rangeStart = `${year}-${month.toString().padStart(2, '0')}-01`;
    const rangeEnd = getMonthEnd(year, month);

    const sourceFetchDatetime = new Date(row.last_fetch);
    const latestSnapshotUpdatedAt = await getLatestSnapshotUpdatedAt(rangeStart, rangeEnd);

    // Process if no snapshot exists OR source is newer OR force flag set.
    if (options.force || !latestSnapshotUpdatedAt || sourceFetchDatetime > latestSnapshotUpdatedAt) {
      monthsToProcess.push({
        retailerId,
        sourceRetailerId,
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
  const { retailerId, sourceRetailerId, rangeStart, rangeEnd } = monthData;

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
  `, [sourceRetailerId, rangeStart, rangeEnd]);

  const aggregate = aggregateResult.rows[0];
  
  console.log('    📊 KEYWORDS SNAPSHOT PREVIEW');
  console.log('    ─────────────────────────────────────────');
  console.log(`    Total Keywords: ${aggregate.total_keywords?.toLocaleString() || 0}`);
  console.log(`    Total Impressions: ${aggregate.total_impressions?.toLocaleString() || 0}`);
  console.log(`    Total Clicks: ${aggregate.total_clicks?.toLocaleString() || 0}`);
  console.log(`    Total Conversions: ${aggregate.total_conversions || 0}`);
  console.log(`    Overall CTR: ${aggregate.overall_ctr ? Number(aggregate.overall_ctr).toFixed(2) + '%' : 'N/A'}`);
  console.log(`    Overall CVR: ${aggregate.overall_cvr ? Number(aggregate.overall_cvr).toFixed(2) + '%' : 'N/A'}`);

  const qualification = await getKeywordQualificationContext(source, sourceRetailerId, rangeStart, rangeEnd, getKeywordThresholdsForRetailer(retailerId));

  console.log(`\n    📈 QUALIFICATION (≥${qualification.minImpressions} impressions, ≥${qualification.minClicks} clicks)`);
  console.log('    ─────────────────────────────────────────');
  if (qualification.fallbackApplied) {
    const t = getKeywordThresholdsForRetailer(retailerId);
    console.log(
      `    Mode: low-volume fallback (trigger: qualified < ${t.low_volume_trigger_qualified} OR positive < ${t.low_volume_trigger_positive})`
    );
    if (qualification.fallbackReason) {
      console.log(`    Fallback Reason: ${qualification.fallbackReason}`);
    }
  }
  console.log(`    Qualified Keywords: ${qualification.qualifiedCount.toLocaleString()}`);
  console.log(`    Positive Keywords (with conversions): ${qualification.positiveCount.toLocaleString()}`);
  console.log(`    Median CTR Threshold: ${Number(qualification.medianCtr).toFixed(2)}%`);

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
    sourceRetailerId,
    rangeStart,
    rangeEnd,
    qualification.minImpressions,
    qualification.minClicks,
    qualification.medianCtr,
  ]);

  const quadrants = quadrantsResult.rows[0];

  console.log(`\n    🎯 QUADRANT ANALYSIS (2x2 Matrix)`);
  console.log('    ─────────────────────────────────────────');
  
  console.log(`\n    🏆 WINNERS (High CTR + Conversions)`);
  console.log(`       Count: ${quadrants.winner_count} (storing up to ${KEYWORD_QUADRANT_LIMITS.LIMIT_WINNERS})`);
  if (quadrants.winner_samples && quadrants.winner_samples.length > 0) {
    quadrants.winner_samples.forEach((kw: any) => {
      console.log(`       • "${kw.search_term}" - ${kw.conversions} conv, ${kw.ctr}% CTR, ${kw.cvr}% CVR`);
    });
  }

  console.log(`\n    ⚠️  CSS WINS, RETAILER LOSES (High CTR + No Conversions)`);
  console.log(`       Count: ${quadrants.css_wins_count} (storing up to ${KEYWORD_QUADRANT_LIMITS.LIMIT_CSS_WINS_RETAILER_LOSES})`);
  if (quadrants.css_wins_samples && quadrants.css_wins_samples.length > 0) {
    quadrants.css_wins_samples.forEach((kw: any) => {
      console.log(`       • "${kw.search_term}" - ${kw.total_clicks} clicks, ${kw.ctr}% CTR, 0 conversions`);
    });
  }

  console.log(`\n    💎 HIDDEN GEMS (Low CTR + Conversions)`);
  console.log(`       Count: ${quadrants.hidden_gems_count} (storing up to ${KEYWORD_QUADRANT_LIMITS.LIMIT_HIDDEN_GEMS})`);
  if (quadrants.hidden_gems_samples && quadrants.hidden_gems_samples.length > 0) {
    quadrants.hidden_gems_samples.forEach((kw: any) => {
      console.log(`       • "${kw.search_term}" - ${kw.conversions} conv, ${kw.ctr}% CTR, ${kw.cvr}% CVR`);
    });
  }

  console.log(`\n    ❌ POOR PERFORMERS (Low CTR + No Conversions)`);
  console.log(`       Count: ${quadrants.poor_performers_count} (storing up to ${KEYWORD_QUADRANT_LIMITS.LIMIT_POOR_PERFORMERS})`);
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
  const { retailerId, sourceRetailerId, rangeStart, rangeEnd } = monthData;

  // Step 1: Get overall aggregate metrics
  const aggregateResult = await source.query(`
    SELECT
      COUNT(*)::int AS row_count,
      MIN(insight_date)::date AS actual_start,
      MAX(insight_date)::date AS actual_end,
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
  `, [sourceRetailerId, rangeStart, rangeEnd]);

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

  // Step 2: Calculate medians with low-volume fallback for sparse retailers.
  const thresholds = getKeywordThresholdsForRetailer(retailerId);
  const qualification = await getKeywordQualificationContext(source, sourceRetailerId, rangeStart, rangeEnd, thresholds);

  // Step 3: Fetch 4-quadrant keyword analysis
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
    sourceRetailerId,
    rangeStart,
    rangeEnd,
    qualification.minImpressions,
    qualification.minClicks,
    qualification.medianCtr,
    KEYWORD_QUADRANT_LIMITS.LIMIT_WINNERS,
    KEYWORD_QUADRANT_LIMITS.LIMIT_CSS_WINS_RETAILER_LOSES,
    KEYWORD_QUADRANT_LIMITS.LIMIT_HIDDEN_GEMS,
    KEYWORD_QUADRANT_LIMITS.LIMIT_POOR_PERFORMERS,
  ]);

  const quadrants = quadrantsResult.rows[0] || {
    winners: [],
    css_wins: [],
    hidden_gems: [],
    poor_performers: [],
  };

  // Build top_keywords JSONB with all 4 quadrants
  const topKeywords = {
    // Legacy top-level keys (keep for backward compatibility)
    winners: quadrants.winners,
    css_wins_retailer_loses: quadrants.css_wins,
    hidden_gems: quadrants.hidden_gems,
    poor_performers: quadrants.poor_performers,
    median_ctr: qualification.medianCtr ? Number(Number(qualification.medianCtr).toFixed(2)) : 0,
    qualified_count: Number(qualification.qualifiedCount),
    qualification: {
      min_impressions: qualification.minImpressions,
      min_clicks: qualification.minClicks,
      fallback_applied: qualification.fallbackApplied,
      fallback_reason: qualification.fallbackReason,
      base_min_impressions: thresholds.min_impressions,
      base_min_clicks: thresholds.min_clicks,
      fallback_min_impressions: thresholds.fallback_min_impressions,
      fallback_min_clicks: thresholds.fallback_min_clicks,
      trigger_qualified_count: thresholds.low_volume_trigger_qualified,
      trigger_positive_count: thresholds.low_volume_trigger_positive,
      qualified_count: qualification.qualifiedCount,
      positive_count: qualification.positiveCount,
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
      top_keywords,
      actual_data_start,
      actual_data_end
    ) VALUES (
      $1, 'month', $2, $3,
      $4, $5, $6, $7, $8, $9, $10, $11, $12
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
      actual_data_start = EXCLUDED.actual_data_start,
      actual_data_end = EXCLUDED.actual_data_end,
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
    aggregate.actual_start,
    aggregate.actual_end,
  ]);

  const inserted = upsertResult.rows[0]?.inserted === true;

  await target.query(
    `DELETE FROM keyword_word_analysis_snapshots
     WHERE retailer_id = $1
       AND range_type = 'month'
       AND range_start = $2
       AND range_end = $3`,
    [retailerId, rangeStart, rangeEnd]
  );

  const wordAnalysisResult = await source.query(
    `WITH tokenized AS (
        SELECT
          $1::varchar AS retailer_id,
          $2::date AS range_start,
          $3::date AS range_end,
          MAX(insight_date) OVER ()::date AS source_analysis_date,
          search_term,
          impressions,
          clicks,
          conversions,
          CASE
            WHEN impressions > 0 THEN (clicks::numeric / impressions::numeric) * 100
            ELSE NULL
          END AS ctr,
          CASE
            WHEN clicks > 0 THEN (conversions::numeric / clicks::numeric) * 100
            ELSE NULL
          END AS cvr,
          regexp_split_to_table(
            lower(regexp_replace(search_term, '[^a-zA-Z0-9]+', ' ', 'g')),
            '[[:space:]]+'
          ) AS word
        FROM keywords
        WHERE retailer_id = $4
          AND insight_date BETWEEN $2 AND $3
      ),
      aggregated AS (
        SELECT
          retailer_id,
          range_start,
          range_end,
          MAX(source_analysis_date) AS source_analysis_date,
          word,
          COUNT(DISTINCT search_term)::int AS keyword_count,
          COUNT(*)::int AS total_occurrences,
          COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END)::int AS keywords_with_clicks,
          COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END)::int AS keywords_with_conversions,
          COALESCE(SUM(impressions), 0)::bigint AS total_impressions,
          COALESCE(SUM(clicks), 0)::bigint AS total_clicks,
          COALESCE(SUM(conversions), 0)::numeric(10,2) AS total_conversions,
          ROUND(
            (COALESCE(SUM(clicks), 0)::numeric / NULLIF(COALESCE(SUM(impressions), 0)::numeric, 0)) * 100,
            4
          ) AS avg_ctr,
          ROUND(
            (COALESCE(SUM(conversions), 0)::numeric / NULLIF(COALESCE(SUM(clicks), 0)::numeric, 0)) * 100,
            4
          ) AS avg_cvr,
          ROUND(
            (COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END)::numeric /
              NULLIF(COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END), 0)) * 100,
            4
          ) AS click_to_conversion_pct
        FROM tokenized
        WHERE length(trim(word)) > 2
          AND word NOT IN ('a', 'an', 'the')
        GROUP BY retailer_id, range_start, range_end, word
        HAVING COUNT(DISTINCT search_term) >= 3
      )
      SELECT
        retailer_id,
        range_start,
        range_end,
        source_analysis_date,
        word,
        keyword_count,
        total_occurrences,
        keywords_with_clicks,
        keywords_with_conversions,
        total_impressions,
        total_clicks,
        total_conversions,
        avg_ctr,
        avg_cvr,
        click_to_conversion_pct,
        NULL::varchar AS word_category,
        CASE
          WHEN keywords_with_conversions >= 5 AND COALESCE(click_to_conversion_pct, 0) >= 10 THEN 'star'
          WHEN keywords_with_conversions >= 2 AND COALESCE(click_to_conversion_pct, 0) >= 5 THEN 'good'
          WHEN keywords_with_clicks >= 5 AND keywords_with_conversions = 0 THEN 'dead'
          WHEN keywords_with_clicks >= 3 AND keywords_with_conversions = 0 THEN 'poor'
          ELSE 'average'
        END AS performance_tier
      FROM aggregated`,
    [retailerId, rangeStart, rangeEnd, sourceRetailerId]
  );

  for (let i = 0; i < wordAnalysisResult.rows.length; i += WORD_ANALYSIS_INSERT_CHUNK_SIZE) {
    const chunk = wordAnalysisResult.rows.slice(i, i + WORD_ANALYSIS_INSERT_CHUNK_SIZE);
    const values: Array<unknown> = [];
    const placeholders = chunk.map((row, index) => {
      const base = index * 18;
      values.push(
        row.retailer_id,
        row.range_start,
        row.range_end,
        row.source_analysis_date,
        row.word,
        row.keyword_count,
        row.total_occurrences,
        row.keywords_with_clicks,
        row.keywords_with_conversions,
        row.total_impressions,
        row.total_clicks,
        row.total_conversions,
        row.avg_ctr,
        row.avg_cvr,
        row.click_to_conversion_pct,
        row.word_category,
        row.performance_tier,
        'month'
      );
      return `($${base + 1}, $${base + 18}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17})`;
    });

    await target.query(
      `INSERT INTO keyword_word_analysis_snapshots (
          retailer_id,
          range_type,
          range_start,
          range_end,
          source_analysis_date,
          word,
          keyword_count,
          total_occurrences,
          keywords_with_clicks,
          keywords_with_conversions,
          total_impressions,
          total_clicks,
          total_conversions,
          avg_ctr,
          avg_cvr,
          click_to_conversion_pct,
          word_category,
          performance_tier
        )
        VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  const brandSplitTablesReady =
    (await tableExists(target, 'keyword_brand_split_snapshots')) &&
    (await tableExists(target, 'keyword_brand_split_term_snapshots'));

  if (brandSplitTablesReady) {
    const brandSplitResult = await source.query<BrandSplitAggregatedKeywordRow>(
      `SELECT
          search_term,
          COALESCE(SUM(impressions), 0)::bigint AS total_impressions,
          COALESCE(SUM(clicks), 0)::bigint AS total_clicks,
          COALESCE(SUM(conversions), 0)::numeric(10,2) AS total_conversions,
          ROUND(
            (COALESCE(SUM(clicks), 0)::numeric / NULLIF(COALESCE(SUM(impressions), 0)::numeric, 0)) * 100,
            4
          ) AS ctr,
          ROUND(
            (COALESCE(SUM(conversions), 0)::numeric / NULLIF(COALESCE(SUM(clicks), 0)::numeric, 0)) * 100,
            4
          ) AS cvr
       FROM keywords
       WHERE retailer_id = $1
         AND insight_date BETWEEN $2 AND $3
       GROUP BY search_term`,
      [sourceRetailerId, rangeStart, rangeEnd]
    );

    const vocabularies = await getBrandSplitVocabularies(target, retailerId);

    await target.query(
      `DELETE FROM keyword_brand_split_term_snapshots
       WHERE retailer_id = $1
         AND range_type = 'month'
         AND range_start = $2
         AND range_end = $3`,
      [retailerId, rangeStart, rangeEnd]
    );

    await target.query(
      `DELETE FROM keyword_brand_split_snapshots
       WHERE retailer_id = $1
         AND range_type = 'month'
         AND range_start = $2
         AND range_end = $3`,
      [retailerId, rangeStart, rangeEnd]
    );

    for (const scope of BRAND_SPLIT_SCOPE_VALUES) {
      const vocabulary = vocabularies[scope];
      const classifiedRows = aggregateBrandSplitTerms(brandSplitResult.rows.map((row) => {
        const impressions = Number(row.total_impressions || 0);
        const clicks = Number(row.total_clicks || 0);
        const conversions = Number(row.total_conversions || 0);
        const classification = classifySearchTermByBrandSplit(row.search_term, vocabulary);
        const matchedAliases = Array.from(new Set(classification.matches.map((match) => match.phrase)));
        const matchedLabels = Array.from(new Set(classification.matches.map((match) => match.label)));

        return {
          searchTerm: row.search_term,
          normalizedSearchTerm: classification.normalizedSearchTerm,
          classification: classification.classification,
          matchedAliases,
          matchedLabels,
          impressions,
          clicks,
          conversions,
          ctr: row.ctr === null ? null : Number(row.ctr),
          cvr: row.cvr === null ? null : Number(row.cvr),
        };
      }));

      const summary = buildBrandSplitSummary(
        classifiedRows.map((row) => ({
          classification: row.classification,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
        })),
        Number(aggregate.total_conversions || 0)
      );
      const detailRows = limitBrandSplitDetailRows(classifiedRows);

      await target.query(
        `INSERT INTO keyword_brand_split_snapshots (
            retailer_id,
            range_type,
            range_start,
            range_end,
            source_analysis_date,
            brand_scope,
            total_search_terms,
            total_impressions,
            total_clicks,
            total_conversions,
            matched_vocab_count,
            summary,
            actual_data_start,
            actual_data_end
          ) VALUES (
            $1, 'month', $2, $3,
            $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
          )`,
        [
          retailerId,
          rangeStart,
          rangeEnd,
          aggregate.actual_end,
          scope,
          classifiedRows.length,
          Number(aggregate.total_impressions || 0),
          Number(aggregate.total_clicks || 0),
          Number(aggregate.total_conversions || 0),
          vocabulary.length,
          JSON.stringify(summary),
          aggregate.actual_start,
          aggregate.actual_end,
        ]
      );

      for (let i = 0; i < detailRows.length; i += BRAND_SPLIT_INSERT_CHUNK_SIZE) {
        const chunk = detailRows.slice(i, i + BRAND_SPLIT_INSERT_CHUNK_SIZE);
        const values: Array<unknown> = [];
        const placeholders = chunk.map((row, index) => {
          const base = index * 17;
          values.push(
            retailerId,
            'month',
            rangeStart,
            rangeEnd,
            aggregate.actual_end,
            scope,
            row.searchTerm,
            row.normalizedSearchTerm,
            row.classification,
            JSON.stringify(row.matchedAliases),
            JSON.stringify(row.matchedLabels),
            row.impressions,
            row.clicks,
            row.conversions,
            row.ctr,
            row.cvr,
            Number(aggregate.total_conversions || 0) > 0
              ? Number(((row.conversions / Number(aggregate.total_conversions || 0)) * 100).toFixed(4))
              : 0,
          );

          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17})`;
        });

        await target.query(
          `INSERT INTO keyword_brand_split_term_snapshots (
              retailer_id,
              range_type,
              range_start,
              range_end,
              source_analysis_date,
              brand_scope,
              search_term,
              normalized_search_term,
              classification,
              matched_aliases,
              matched_brand_labels,
              total_impressions,
              total_clicks,
              total_conversions,
              ctr,
              cvr,
              share_of_total_conversions_pct
            )
            VALUES ${placeholders.join(', ')}`,
          values
        );
      }
    }
  }

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
  const { retailerId, sourceRetailerId, rangeStart, rangeEnd } = monthData;

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
  `, [sourceRetailerId, rangeStart, rangeEnd]);

  const dataRangeResult = await source.query<{
    actual_start: string | null;
    actual_end: string | null;
  }>(`
    SELECT
      MIN(insight_date)::date AS actual_start,
      MAX(insight_date)::date AS actual_end
    FROM category_performance
    WHERE retailer_id = $1
      AND insight_date BETWEEN $2 AND $3
  `, [sourceRetailerId, rangeStart, rangeEnd]);

  const actualStart = dataRangeResult.rows[0]?.actual_start ?? null;
  const actualEnd = dataRangeResult.rows[0]?.actual_end ?? null;

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
  //
  // CVR is the primary signal. Benchmarks are derived from the top nodes covering 85%
  // of node impressions, excluding uncategorised (empty L1) entries. This anchors the
  // benchmark to the retailer's real main categories rather than long-tail zeros.
  //
  //   star          — CVR ≥ avg AND CTR ≥ avg (converts well and attracts clicks)
  //   strong        — CVR ≥ avg, CTR below avg (converts well; niche or lower click volume)
  //   underperforming — CVR < avg but ≥ 50% of avg (has room to improve)
  //   poor          — CVR < 50% of avg, or zero conversions/clicks/impressions

  const classifyTier = (
    ctr: number | null,
    cvr: number | null,
    impressions: number,
    clicks: number,
    conversions: number,
    avgCtr: number,
    avgCvr: number,
  ): string => {
    if (impressions === 0 || clicks === 0 || conversions === 0) return 'poor';
    if (ctr === null || cvr === null) return 'poor';
    // CVR is the primary signal; CTR distinguishes star from strong.
    //   star          — CVR ≥ avg AND CTR ≥ avg (best of both)
    //   strong        — CVR ≥ avg, CTR below avg (converts well, lower click volume)
    //   underperforming — CVR < avg but ≥ 50% of avg (room to improve)
    //   poor          — CVR < 50% of avg (significantly lagging), or no conversions (caught above)
    const aboveCvr = cvr >= avgCvr;
    const aboveCtr = ctr >= avgCtr;
    if (aboveCvr && aboveCtr) return 'star';
    if (aboveCvr) return 'strong';
    if (avgCvr === 0 || cvr >= avgCvr * 0.5) return 'underperforming';
    return 'poor';
  };

  // Build the benchmark set: all categorised nodes with own impressions, sorted by
  // impressions descending, taking enough to cover 85% of total impression volume.
  const scorableNodes = Array.from(categoryMap.values())
    .filter(n => n.node_impressions > 0 && n.level1 !== '')
    .sort((a, b) => b.node_impressions - a.node_impressions);

  const totalScoredImpressions = scorableNodes.reduce((sum, n) => sum + n.node_impressions, 0);
  const impressionTarget = totalScoredImpressions * 0.85;
  let accumulated = 0;
  const benchmarkNodes: typeof scorableNodes = [];
  for (const node of scorableNodes) {
    benchmarkNodes.push(node);
    accumulated += node.node_impressions;
    if (accumulated >= impressionTarget) break;
  }

  // Simple average (unweighted) — each category node counts equally as a peer
  const ctrBenchmarkNodes = benchmarkNodes.filter(n => n.node_ctr !== null);
  const cvrBenchmarkNodes = benchmarkNodes.filter(n => n.node_cvr !== null);
  const benchmarkCtr = ctrBenchmarkNodes.length > 0
    ? ctrBenchmarkNodes.reduce((sum, n) => sum + (n.node_ctr as number), 0) / ctrBenchmarkNodes.length
    : 0;
  const benchmarkCvr = cvrBenchmarkNodes.length > 0
    ? cvrBenchmarkNodes.reduce((sum, n) => sum + (n.node_cvr as number), 0) / cvrBenchmarkNodes.length
    : 0;

  console.log(`    Benchmark: ${benchmarkNodes.length} nodes (${Math.round(accumulated / totalScoredImpressions * 100)}% of impressions), avg CTR ${benchmarkCtr.toFixed(2)}%, avg CVR ${benchmarkCvr.toFixed(2)}%`);

  for (const node of categoryMap.values()) {
    // Nodes with zero own impressions are pure parent/routing nodes — don't classify them
    node.health_status_node = node.node_impressions === 0
      ? null
      : classifyTier(
          node.node_ctr, node.node_cvr,
          node.node_impressions, node.node_clicks, node.node_conversions,
          benchmarkCtr, benchmarkCvr,
        );
    // Branch: use same node-derived benchmarks — branch aggregates the same products,
    // so the same CTR/CVR thresholds apply as a meaningful comparison point.
    node.health_status_branch = classifyTier(
      node.branch_ctr, node.branch_cvr,
      node.branch_impressions, node.branch_clicks, node.branch_conversions,
      benchmarkCtr, benchmarkCvr,
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

  // Step 6: Insert all category nodes in chunks for better write throughput.
  const nodes = Array.from(categoryMap.values());
  let insertedCount = 0;

  for (let i = 0; i < nodes.length; i += CATEGORY_INSERT_CHUNK_SIZE) {
    const chunk = nodes.slice(i, i + CATEGORY_INSERT_CHUNK_SIZE);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    for (const node of chunk) {
      const hasChildren = (childCounts.get(node.full_path) || 0) > 0;
      const childCount = childCounts.get(node.full_path) || 0;
      const base = values.length;

      placeholders.push(`(
        $${base + 1},
        'month',
        $${base + 2},
        $${base + 3},
        $${base + 4},
        $${base + 5},
        $${base + 6},
        $${base + 7},
        $${base + 8},
        $${base + 9},
        $${base + 10},
        $${base + 11},
        $${base + 12},
        $${base + 13},
        $${base + 14},
        $${base + 15},
        $${base + 16},
        $${base + 17},
        $${base + 18},
        $${base + 19},
        $${base + 20},
        $${base + 21},
        $${base + 22},
        $${base + 23},
        $${base + 24},
        $${base + 25},
        $${base + 26},
        $${base + 27}
      )`);

      values.push(
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
        hasChildren,
        childCount,
        node.health_status_node,
        node.health_status_branch,
        actualStart,
        actualEnd,
      );
    }

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
        health_status_branch,
        actual_data_start,
        actual_data_end
      ) VALUES ${placeholders.join(',')}
    `, values);

    insertedCount += chunk.length;
  }

  return {
    domain: 'categories',
    retailerId,
    month: rangeStart.slice(0, 7),
    rowCount: insertedCount,
    operation: 'created',
  };
}

async function generateProductSnapshot(monthData: MonthToProcess): Promise<SnapshotResult> {
  const source = getSourcePool();
  const target = getTargetPool();
  const { retailerId, sourceRetailerId, rangeStart, rangeEnd } = monthData;

  // Step 1: Get overall aggregate metrics
  const aggregateResult = await source.query(`
    SELECT
      COUNT(*)::int AS row_count,
      MIN(insight_date)::date AS actual_start,
      MAX(insight_date)::date AS actual_end,
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
  `, [sourceRetailerId, rangeStart, rangeEnd]);

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
  `, [sourceRetailerId, rangeStart, rangeEnd]);

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
      product_classifications,
      actual_data_start,
      actual_data_end
    ) VALUES (
      $1, 'month', $2, $3,
      $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
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
      actual_data_start = EXCLUDED.actual_data_start,
      actual_data_end = EXCLUDED.actual_data_end,
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
    aggregate.actual_start,
    aggregate.actual_end,
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

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await handler(items[current], current);
    }
  };

  const workerCount = Math.min(safeConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

interface RetailerRunSummary {
  retailerId: string;
  monthsProcessed: number;
  snapshotsWritten: number;
  elapsedMs: number;
}

interface RetailerRunOutput {
  results: SnapshotResult[];
  summary: RetailerRunSummary;
}

type DomainHealthStatus = 'ok' | 'no_source_data' | 'no_new_data' | 'unknown';
type SnapshotHealthType = 'keywords' | 'categories' | 'products';

const SNAPSHOT_TABLE_BY_TYPE: Record<SnapshotHealthType, 'keywords_snapshots' | 'category_performance_snapshots' | 'product_performance_snapshots'> = {
  keywords: 'keywords_snapshots',
  categories: 'category_performance_snapshots',
  products: 'product_performance_snapshots',
};

const RESULT_DOMAIN_BY_TYPE: Record<SnapshotHealthType, SnapshotResult['domain']> = {
  keywords: 'keywords',
  categories: 'categories',
  products: 'products',
};

interface SnapshotTableHealth {
  last_successful_at: Date | null;
  last_successful_period: string | null;
  record_count: number;
}

async function getSnapshotTableHealth(retailerId: string, snapshotType: SnapshotHealthType): Promise<SnapshotTableHealth> {
  const target = getTargetPool();
  const tableName = SNAPSHOT_TABLE_BY_TYPE[snapshotType];

  const result = await target.query<{
    last_successful_at: Date | null;
    last_successful_period: string | null;
    record_count: string;
  }>(`
    SELECT
      MAX(last_updated) AS last_successful_at,
      to_char(MAX(range_start), 'YYYY-MM') AS last_successful_period,
      COUNT(*)::text AS record_count
    FROM ${tableName}
    WHERE retailer_id = $1
      AND range_type = 'month'
  `, [retailerId]);

  const row = result.rows[0];
  return {
    last_successful_at: row?.last_successful_at ?? null,
    last_successful_period: row?.last_successful_period ?? null,
    record_count: Number(row?.record_count ?? 0),
  };
}

async function upsertRetailerSnapshotHealth(
  retailerId: string,
  snapshotType: SnapshotHealthType,
  status: DomainHealthStatus,
  health: SnapshotTableHealth,
): Promise<void> {
  const target = getTargetPool();

  await target.query(`
    INSERT INTO retailer_snapshot_health (
      retailer_id,
      snapshot_type,
      status,
      last_attempted_at,
      last_successful_at,
      last_successful_period,
      record_count
    ) VALUES (
      $1, $2, $3, NOW(), $4, $5, $6
    )
    ON CONFLICT (retailer_id, snapshot_type)
    DO UPDATE SET
      status = EXCLUDED.status,
      last_attempted_at = NOW(),
      last_successful_at = COALESCE(EXCLUDED.last_successful_at, retailer_snapshot_health.last_successful_at),
      last_successful_period = COALESCE(EXCLUDED.last_successful_period, retailer_snapshot_health.last_successful_period),
      record_count = COALESCE(EXCLUDED.record_count, retailer_snapshot_health.record_count)
  `, [
    retailerId,
    snapshotType,
    status,
    health.last_successful_at,
    health.last_successful_period,
    health.record_count,
  ]);
}

async function refreshRetailerSnapshotHealthFromResults(
  retailerId: string,
  domainResults: SnapshotResult[],
): Promise<void> {
  const types: SnapshotHealthType[] = ['keywords', 'categories', 'products'];

  for (const snapshotType of types) {
    const domain = RESULT_DOMAIN_BY_TYPE[snapshotType];
    const wroteSnapshot = domainResults.some((result) => result.domain === domain && result.operation !== 'skipped');
    const health = await getSnapshotTableHealth(retailerId, snapshotType);

    let status: DomainHealthStatus;
    if (wroteSnapshot) {
      status = health.last_successful_at ? 'ok' : 'unknown';
    } else if (health.record_count > 0) {
      status = 'no_new_data';
    } else {
      status = 'no_source_data';
    }

    await upsertRetailerSnapshotHealth(retailerId, snapshotType, status, health);
  }
}

async function processRetailer(
  retailer: RetailerConfig,
  options: GeneratorOptions,
  index: number,
  total: number
): Promise<RetailerRunOutput> {
  const retailerStart = Date.now();
  const results: SnapshotResult[] = [];
  const runLabel = `${index + 1}/${total}`;

  console.log(`\n[${runLabel}] Processing ${retailer.retailerId}...`);

  if (!retailer.sourceRetailerId) {
    console.log(`[${runLabel}] Skipping ${retailer.retailerId}: no source_retailer_id configured`);
    return {
      results,
      summary: {
        retailerId: retailer.retailerId,
        monthsProcessed: 0,
        snapshotsWritten: 0,
        elapsedMs: Date.now() - retailerStart,
      },
    };
  }

  const months = await identifyMonthsToProcess(retailer.retailerId, retailer.sourceRetailerId, options);
  console.log(`[${runLabel}] ${retailer.retailerId}: ${months.length} month(s) to process`);

  if (months.length === 0) {
    if (!options.dryRun) {
      await refreshRetailerSnapshotHealthFromResults(retailer.retailerId, results);
    }
    console.log(`[${runLabel}] ${retailer.retailerId}: all snapshots up to date`);
    return {
      results,
      summary: {
        retailerId: retailer.retailerId,
        monthsProcessed: 0,
        snapshotsWritten: 0,
        elapsedMs: Date.now() - retailerStart,
      },
    };
  }

  for (const monthData of months) {
    const monthStart = Date.now();
    const monthStr = `${monthData.year}-${monthData.month.toString().padStart(2, '0')}`;
    console.log(`[${runLabel}] ${retailer.retailerId} month ${monthStr}: ${monthData.rangeStart} to ${monthData.rangeEnd}`);

    if (options.dryRun) {
      console.log(`[${runLabel}] ${retailer.retailerId} month ${monthStr}: [DRY RUN] previewing`);
      await previewKeywordSnapshot(monthData);
      continue;
    }

    const domainFilter = options.domains;
    const runKeywords = !domainFilter || domainFilter.includes('keywords');
    const runCategories = !domainFilter || domainFilter.includes('categories');
    const runProducts = !domainFilter || domainFilter.includes('products');

    let domainResults: SnapshotResult[];
    if (options.domainParallel) {
      const domainTasks: Promise<SnapshotResult>[] = [];
      if (runKeywords) domainTasks.push(generateKeywordSnapshot(monthData));
      if (runCategories) domainTasks.push(generateCategorySnapshot(monthData));
      if (runProducts) domainTasks.push(generateProductSnapshot(monthData));
      domainResults = await Promise.all(domainTasks);
    } else {
      domainResults = [];
      if (runKeywords) domainResults.push(await generateKeywordSnapshot(monthData));
      if (runCategories) domainResults.push(await generateCategorySnapshot(monthData));
      if (runProducts) domainResults.push(await generateProductSnapshot(monthData));
    }

    results.push(...domainResults);
    const monthElapsedSec = ((Date.now() - monthStart) / 1000).toFixed(1);

    console.log(`[${runLabel}] ${retailer.retailerId} month ${monthStr} complete in ${monthElapsedSec}s`);
    for (const dr of domainResults) {
      console.log(`  ${dr.domain}: ${dr.operation} (${dr.rowCount} rows)`);
    }
  }

  const elapsedMs = Date.now() - retailerStart;
  const snapshotsWritten = results.filter((result) => result.operation !== 'skipped').length;

  if (!options.dryRun) {
    await refreshRetailerSnapshotHealthFromResults(retailer.retailerId, results);
  }

  console.log(
    `[${runLabel}] ${retailer.retailerId} complete: ${months.length} month(s), ${snapshotsWritten} snapshot(s) written in ${(elapsedMs / 1000).toFixed(1)}s`
  );

  return {
    results,
    summary: {
      retailerId: retailer.retailerId,
      monthsProcessed: months.length,
      snapshotsWritten,
      elapsedMs,
    },
  };
}

// ============================================================================
// Snapshot Generation (Orchestration)
// ============================================================================

/**
 * Main entry point for snapshot generation
 */
export async function generateSnapshots(options: GeneratorOptions = {}): Promise<SnapshotResult[]> {
  const resolvedOptions: GeneratorOptions = {
    ...options,
    retailerConcurrency: options.retailerConcurrency ?? DEFAULT_RETAILER_CONCURRENCY,
    domainParallel: options.domainParallel ?? DEFAULT_DOMAIN_PARALLEL,
  };

  console.log('========================================');
  console.log('Snapshot Generator');
  console.log('========================================');
  console.log(`Mode: ${resolvedOptions.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Source DB: ${SOURCE_DB_MODE} (${SOURCE_DB_CONFIG.host}:${SOURCE_DB_CONFIG.port})`);
  if (resolvedOptions.retailer) console.log(`Retailer: ${resolvedOptions.retailer}`);
  if (resolvedOptions.month) console.log(`Month: ${resolvedOptions.month}`);
  console.log(`Retailer concurrency: ${resolvedOptions.retailerConcurrency}`);
  console.log(`Domain parallelism: ${resolvedOptions.domainParallel ? 'enabled' : 'disabled'}`);
  if (resolvedOptions.domains) console.log(`Domains: ${resolvedOptions.domains.join(', ')}`);
  console.log('========================================\n');
  
  try {
    // Load per-retailer keyword threshold tiers from config DB
    await loadKeywordThresholds();

    // Get enabled retailers
    const retailers = await getEnabledRetailers(resolvedOptions);
    console.log(`Found ${retailers.length} enabled retailer(s):`);
    retailers.forEach(r => console.log(`  - ${r.retailerId} (${r.retailerName})`));
    console.log('');
    
    if (retailers.length === 0) {
      console.log('No enabled retailers found. Exiting.');
      return [];
    }
    
    const retailerOutputs = await runWithConcurrency(
      retailers,
      resolvedOptions.retailerConcurrency ?? DEFAULT_RETAILER_CONCURRENCY,
      (retailer, index) => processRetailer(retailer, resolvedOptions, index, retailers.length)
    );

    const results = retailerOutputs.flatMap((output) => output.results);
    const summaries = retailerOutputs.map((output) => output.summary);
    const totalRetailersWithWork = summaries.filter((summary) => summary.monthsProcessed > 0).length;
    const totalMonthsProcessed = summaries.reduce((sum, summary) => sum + summary.monthsProcessed, 0);
    const totalSnapshotsWritten = summaries.reduce((sum, summary) => sum + summary.snapshotsWritten, 0);
    const totalElapsedMs = summaries.reduce((sum, summary) => sum + summary.elapsedMs, 0);

    if (totalRetailersWithWork > 0) {
      const avgRetailerSec = (totalElapsedMs / totalRetailersWithWork / 1000).toFixed(1);
      console.log(
        `Work summary: ${totalRetailersWithWork}/${retailers.length} retailers processed, ${totalMonthsProcessed} month(s), ${totalSnapshotsWritten} snapshot(s), avg ${avgRetailerSec}s/retailer`
      );
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
    } else if (arg.startsWith('--retailer-concurrency=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!Number.isNaN(value)) options.retailerConcurrency = Math.max(1, value);
    } else if (arg === '--retailer-concurrency' && i + 1 < args.length) {
      const value = parseInt(args[++i], 10);
      if (!Number.isNaN(value)) options.retailerConcurrency = Math.max(1, value);
    } else if (arg === '--sequential-domains') {
      options.domainParallel = false;
    }
  }
  
  generateSnapshots(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
