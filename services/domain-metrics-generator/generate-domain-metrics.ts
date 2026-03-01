import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment from project root BEFORE importing db
config({ path: resolve(process.cwd(), '.env.local') })

import { query, transaction, closePool } from '../../lib/db'
import type { PoolClient } from 'pg'
import {
  CalculationResult,
  CategorySnapshot,
  DomainMetricRecord,
  GeneratorOptions,
  KeywordsSnapshot,
  ProductSnapshot,
  AuctionSnapshot,
  CoverageSnapshot,
} from './types'
import { buildOverviewMetrics } from './calculators/overview'
import { buildKeywordsMetrics } from './calculators/keywords'
import { buildCategoriesMetrics } from './calculators/categories'
import { buildProductsMetrics } from './calculators/products'
import { buildAuctionsMetrics } from './calculators/auctions'

interface DomainCounts {
  overview: number
  keywords: number
  categories: number
  products: number
  auctions: number
}

interface BuildResult {
  metrics: DomainMetricRecord[]
  errors: string[]
  domainCounts: DomainCounts
}

interface RetailerMetricSummary {
  retailerId: string
  months: number
  counts: DomainCounts
  upToDate: boolean
}

interface PeriodToProcess {
  retailerId: string
  periodStart: string
  periodEnd: string
  snapshotId: number
  lastUpdated: string
}

const formatPeriodLabel = (periodStart: string): string => {
  return new Date(periodStart).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

const getPreviousPeriod = (periodStart: string): string => {
  const date = new Date(periodStart)
  date.setMonth(date.getMonth() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

const getPeriodEnd = (periodStart: string): string => {
  const [year, month] = periodStart.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

const getEnabledRetailers = async (options: GeneratorOptions): Promise<string[]> => {
  let sql = `
    SELECT retailer_id
    FROM retailers
    WHERE snapshot_enabled = true
  `
  const params: string[] = []

  if (options.retailer) {
    sql += ` AND retailer_id = $1`
    params.push(options.retailer)
  }

  sql += ` ORDER BY retailer_id`

  const result = await query<{ retailer_id: string }>(sql, params)
  return result.rows.map((row) => row.retailer_id)
}

const identifyPeriodsToProcess = async (retailerId: string, options: GeneratorOptions): Promise<PeriodToProcess[]> => {
  const params: Array<string> = [retailerId]
  let sql = `
    SELECT
      ks.id AS snapshot_id,
      ks.range_start::text AS period_start,
      ks.range_end::text AS period_end,
      ks.last_updated,
      dm.calculated_at
    FROM keywords_snapshots ks
    LEFT JOIN (
      SELECT
        retailer_id,
        period_start::text,
        period_end::text,
        MAX(calculated_at) AS calculated_at
      FROM domain_metrics
      WHERE retailer_id = $1
      GROUP BY retailer_id, period_start, period_end
    ) dm
      ON dm.retailer_id = ks.retailer_id
      AND dm.period_start::text = ks.range_start::text
      AND dm.period_end::text = ks.range_end::text
    WHERE ks.retailer_id = $1
      AND ks.range_type = 'month'
  `

  if (options.month) {
    const periodStart = `${options.month}-01`
    const periodEnd = getPeriodEnd(periodStart)
    sql += ` AND ks.range_start = $2 AND ks.range_end = $3`
    params.push(periodStart, periodEnd)
  }

  sql += ` ORDER BY ks.range_start DESC`

  const result = await query<{
    snapshot_id: number
    period_start: string
    period_end: string
    last_updated: string
    calculated_at: string | null
  }>(sql, params)

  return result.rows
    .filter((row) => options.force || !row.calculated_at || new Date(row.last_updated) > new Date(row.calculated_at))
    .map((row) => ({
      retailerId,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      snapshotId: row.snapshot_id,
      lastUpdated: row.last_updated,
    }))
}

const fetchKeywordsSnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<KeywordsSnapshot | null> => {
  const result = await query<KeywordsSnapshot>(
    `
    SELECT *
    FROM keywords_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    `,
    [retailerId, periodStart, periodEnd]
  )

  return result.rows[0] || null
}

const fetchCategorySnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<CategorySnapshot | null> => {
  // The category_performance_snapshots table stores one row per category node (post Feb 22
  // restructure). We aggregate those rows back into a single summary matching CategorySnapshot.
  // health_status_branch reflects branch-level classification and gives the most complete
  // health picture for a summary view. Tier names: 'star', 'strong', 'underperforming', 'poor'.
  // Mapped to old field names: strong→healthy, underperforming→attention, poor→broken.
  const result = await query<CategorySnapshot>(
    `
    SELECT
      retailer_id,
      MAX(id)                                                        AS id,
      range_start,
      range_end,
      MAX(last_updated)                                              AS last_updated,
      COUNT(*) FILTER (WHERE node_impressions > 0)::int                  AS total_categories,
      SUM(node_impressions)::bigint                                          AS total_impressions,
      SUM(node_clicks)::bigint                                               AS total_clicks,
      SUM(node_conversions)::numeric                                         AS total_conversions,
      CASE WHEN SUM(node_impressions) > 0
        THEN (SUM(node_clicks)::numeric / SUM(node_impressions)) * 100
        ELSE NULL END                                                        AS overall_ctr,
      CASE WHEN SUM(node_clicks) > 0
        THEN (SUM(node_conversions)::numeric / SUM(node_clicks)) * 100
        ELSE NULL END                                                        AS overall_cvr,
      COUNT(*) FILTER (WHERE health_status_branch = 'star')::int         AS health_star_count,
      COUNT(*) FILTER (WHERE health_status_branch = 'strong')::int       AS health_healthy_count,
      COUNT(*) FILTER (WHERE health_status_branch = 'underperforming')::int AS health_attention_count,
      0::int                                                               AS health_underperforming_count,
      COUNT(*) FILTER (WHERE health_status_branch = 'poor')::int         AS health_broken_count,
      NULL::jsonb                                                            AS health_summary
    FROM category_performance_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    GROUP BY retailer_id, range_start, range_end
    `,
    [retailerId, periodStart, periodEnd]
  )

  return result.rows[0] || null
}

const fetchProductSnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<ProductSnapshot | null> => {
  const result = await query<ProductSnapshot>(
    `
    SELECT *
    FROM product_performance_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    `,
    [retailerId, periodStart, periodEnd]
  )

  return result.rows[0] || null
}

const fetchAuctionSnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<AuctionSnapshot | null> => {
  const result = await query<AuctionSnapshot>(
    `
    SELECT *
    FROM auction_insights_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    `,
    [retailerId, periodStart, periodEnd]
  )

  return result.rows[0] || null
}

const fetchCoverageSnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<CoverageSnapshot | null> => {
  const result = await query<CoverageSnapshot>(
    `
    SELECT *
    FROM product_coverage_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    `,
    [retailerId, periodStart, periodEnd]
  )

  return result.rows[0] || null
}

const insertDomainMetrics = async (client: PoolClient, metrics: DomainMetricRecord[]): Promise<number> => {
  if (metrics.length === 0) return 0

  const values = metrics.map((metric, index) => {
    const baseIndex = index * 11
    return `(
      $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4},
      $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8},
      $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}
    )`
  })

  const params = metrics.flatMap((metric) => [
    metric.retailerId,
    metric.pageType,
    metric.tabName,
    metric.periodType,
    metric.periodStart,
    metric.periodEnd,
    metric.componentType,
    JSON.stringify(metric.componentData),
    metric.sourceSnapshotId ?? null,
    metric.calculationMethod ?? 'algorithmic',
    metric.isActive ?? true,
  ])

  const sql = `
    INSERT INTO domain_metrics (
      retailer_id,
      page_type,
      tab_name,
      period_type,
      period_start,
      period_end,
      component_type,
      component_data,
      source_snapshot_id,
      calculation_method,
      is_active
    ) VALUES ${values.join(',')}
    ON CONFLICT (retailer_id, page_type, tab_name, period_start, period_end, component_type)
    DO UPDATE SET
      component_data = EXCLUDED.component_data,
      calculated_at = NOW(),
      source_snapshot_id = EXCLUDED.source_snapshot_id,
      calculation_method = EXCLUDED.calculation_method,
      is_active = EXCLUDED.is_active
  `

  await client.query(sql, params)
  return metrics.length
}

const buildMetricsForPeriod = async (
  retailerId: string,
  periodStart: string,
  periodEnd: string
): Promise<BuildResult> => {
  const previousPeriodStart = getPreviousPeriod(periodStart)
  const previousPeriodEnd = getPeriodEnd(previousPeriodStart)

  const [
    keywordsSnapshot,
    previousKeywordsSnapshot,
    categorySnapshot,
    previousCategorySnapshot,
    productSnapshot,
    previousProductSnapshot,
    auctionSnapshot,
  ] = await Promise.all([
    fetchKeywordsSnapshot(retailerId, periodStart, periodEnd),
    fetchKeywordsSnapshot(retailerId, previousPeriodStart, previousPeriodEnd),
    fetchCategorySnapshot(retailerId, periodStart, periodEnd),
    fetchCategorySnapshot(retailerId, previousPeriodStart, previousPeriodEnd),
    fetchProductSnapshot(retailerId, periodStart, periodEnd),
    fetchProductSnapshot(retailerId, previousPeriodStart, previousPeriodEnd),
    fetchAuctionSnapshot(retailerId, periodStart, periodEnd),
  ])

  const overviewResult   = buildOverviewMetrics(keywordsSnapshot, previousKeywordsSnapshot, periodStart, periodEnd)
  const keywordsResult   = buildKeywordsMetrics(keywordsSnapshot, previousKeywordsSnapshot, periodStart, periodEnd)
  const categoriesResult = buildCategoriesMetrics(categorySnapshot, previousCategorySnapshot, periodStart, periodEnd)
  const productsResult   = buildProductsMetrics(productSnapshot, previousProductSnapshot, periodStart, periodEnd)
  const auctionsResult   = buildAuctionsMetrics(auctionSnapshot, periodStart, periodEnd)

  const allResults = [overviewResult, keywordsResult, categoriesResult, productsResult, auctionsResult]

  return {
    metrics: allResults.flatMap((r) => r.metrics),
    errors:  allResults.flatMap((r) => r.errors),
    domainCounts: {
      overview:   overviewResult.metrics.length,
      keywords:   keywordsResult.metrics.length,
      categories: categoriesResult.metrics.length,
      products:   productsResult.metrics.length,
      auctions:   auctionsResult.metrics.length,
    },
  }
}

export const generateMetrics = async (options: GeneratorOptions): Promise<void> => {
  console.log('Domain Metrics Generator')
  if (options.dryRun) console.log('Mode: DRY RUN')
  if (options.force)  console.log('Mode: FORCE (reprocessing all periods)')
  if (options.retailer) console.log(`Retailer: ${options.retailer}`)
  if (options.month)    console.log(`Month: ${options.month}`)
  console.log('')

  const summaryRows: RetailerMetricSummary[] = []

  try {
    const retailers = await getEnabledRetailers(options)

    if (retailers.length === 0) {
      console.log('No enabled retailers found. Exiting.')
      return
    }

    for (const retailerId of retailers) {
      const periods = await identifyPeriodsToProcess(retailerId, options)

      if (periods.length === 0) {
        summaryRows.push({ retailerId, months: 0, counts: { overview: 0, keywords: 0, categories: 0, products: 0, auctions: 0 }, upToDate: true })
        continue
      }

      const totals: DomainCounts = { overview: 0, keywords: 0, categories: 0, products: 0, auctions: 0 }
      const seenErrors = new Set<string>()

      for (const period of periods) {
        process.stdout.write(`  ${retailerId} ${period.periodStart.slice(0, 7)}... `)

        const { metrics, errors, domainCounts } = await buildMetricsForPeriod(
          retailerId,
          period.periodStart,
          period.periodEnd
        )

        if (errors.length > 0) {
          errors.forEach((e) => {
            if (!seenErrors.has(e)) {
              seenErrors.add(e)
              console.warn(`\n    Warning: ${e}`)
            }
          })
        }

        if (metrics.length === 0) {
          console.log('no metrics')
          continue
        }

        if (options.dryRun) {
          console.log(`[DRY RUN] ${metrics.length} metrics`)
        } else {
          await transaction(async (client) => insertDomainMetrics(client, metrics))
          console.log(`done (${metrics.length} metrics)`)
        }

        totals.overview   += domainCounts.overview
        totals.keywords   += domainCounts.keywords
        totals.categories += domainCounts.categories
        totals.products   += domainCounts.products
        totals.auctions   += domainCounts.auctions
      }

      summaryRows.push({ retailerId, months: periods.length, counts: totals, upToDate: false })
    }

    // ── Summary table ───────────────────────────────────────────────
    const col  = (s: string, w: number) => s.slice(0, w).padEnd(w)
    const rCol = (s: string, w: number) => s.slice(0, w).padStart(w)
    const fmt  = (n: number, upToDate: boolean) =>
      upToDate ? '✓' : n === 0 ? '–' : n.toLocaleString()
    const W = { r: 22, mo: 3, ov: 9, kw: 10, cat: 11, prod: 10, auc: 9 }
    const divider = `${'─'.repeat(W.r)}─${'─'.repeat(W.mo)}─${'─'.repeat(W.ov)}─${'─'.repeat(W.kw)}─${'─'.repeat(W.cat)}─${'─'.repeat(W.prod)}─${'─'.repeat(W.auc)}`
    console.log(`\n${col('Retailer', W.r)} ${rCol('Mo', W.mo)} ${rCol('Overview', W.ov)} ${rCol('Keywords', W.kw)} ${rCol('Categories', W.cat)} ${rCol('Products', W.prod)} ${rCol('Auctions', W.auc)}`)
    console.log(divider)
    for (const r of summaryRows) {
      const u = r.upToDate
      const moStr = r.months > 0 ? String(r.months) : '–'
      // When upToDate, just show it once in Overview column, blank the rest
      if (u) {
        console.log(`${col(r.retailerId, W.r)} ${rCol(moStr, W.mo)} ${rCol('✓', W.ov)} ${rCol('', W.kw)} ${rCol('', W.cat)} ${rCol('', W.prod)} ${rCol('', W.auc)}`)
      } else {
        console.log(`${col(r.retailerId, W.r)} ${rCol(moStr, W.mo)} ${rCol(fmt(r.counts.overview, u), W.ov)} ${rCol(fmt(r.counts.keywords, u), W.kw)} ${rCol(fmt(r.counts.categories, u), W.cat)} ${rCol(fmt(r.counts.products, u), W.prod)} ${rCol(fmt(r.counts.auctions, u), W.auc)}`)
      }
    }
    console.log(divider)
    console.log('\nDomain metrics generation complete')
  } catch (error) {
    console.error('Error generating domain metrics:', error)
    throw error
  } finally {
    await closePool()
  }
}

const parseArgs = (args: string[]): GeneratorOptions => {
  const options: GeneratorOptions = {}

  args.forEach((arg) => {
    if (arg.startsWith('--retailer=')) {
      options.retailer = arg.split('=')[1]
    } else if (arg.startsWith('--month=')) {
      options.month = arg.split('=')[1]
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    }
  })

  return options
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2))
  generateMetrics(options)
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
