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
    FROM retailer_metadata
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
      ks.range_start AS period_start,
      ks.range_end AS period_end,
      ks.last_updated,
      dm.calculated_at
    FROM keywords_snapshots ks
    LEFT JOIN (
      SELECT
        retailer_id,
        period_start,
        period_end,
        MAX(calculated_at) AS calculated_at
      FROM domain_metrics
      WHERE retailer_id = $1
      GROUP BY retailer_id, period_start, period_end
    ) dm
      ON dm.retailer_id = ks.retailer_id
      AND dm.period_start = ks.range_start
      AND dm.period_end = ks.range_end
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
    .filter((row) => !row.calculated_at || new Date(row.last_updated) > new Date(row.calculated_at))
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
  const result = await query<CategorySnapshot>(
    `
    SELECT *
    FROM category_performance_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
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
): Promise<CalculationResult> => {
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
    coverageSnapshot,
  ] = await Promise.all([
    fetchKeywordsSnapshot(retailerId, periodStart, periodEnd),
    fetchKeywordsSnapshot(retailerId, previousPeriodStart, previousPeriodEnd),
    fetchCategorySnapshot(retailerId, periodStart, periodEnd),
    fetchCategorySnapshot(retailerId, previousPeriodStart, previousPeriodEnd),
    fetchProductSnapshot(retailerId, periodStart, periodEnd),
    fetchProductSnapshot(retailerId, previousPeriodStart, previousPeriodEnd),
    fetchAuctionSnapshot(retailerId, periodStart, periodEnd),
    fetchCoverageSnapshot(retailerId, periodStart, periodEnd),
  ])

  const results: CalculationResult[] = [
    buildOverviewMetrics(keywordsSnapshot, previousKeywordsSnapshot, periodStart, periodEnd),
    buildKeywordsMetrics(keywordsSnapshot, previousKeywordsSnapshot, periodStart, periodEnd),
    buildCategoriesMetrics(categorySnapshot, previousCategorySnapshot, periodStart, periodEnd),
    buildProductsMetrics(productSnapshot, previousProductSnapshot, periodStart, periodEnd),
    buildAuctionsMetrics(auctionSnapshot, periodStart, periodEnd),
  ]

  const skipped: CalculationResult[] = []
  if (coverageSnapshot) {
    skipped.push({ metrics: [], errors: ['Coverage metrics skipped (generator disabled)'] })
  }

  return {
    metrics: results.flatMap((result) => result.metrics),
    errors: [...results.flatMap((result) => result.errors), ...skipped.flatMap((result) => result.errors)],
  }
}

const generateMetrics = async (options: GeneratorOptions): Promise<void> => {
  console.log('========================================')
  console.log('Domain Metrics Generator')
  console.log('========================================')
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (options.retailer) console.log(`Retailer: ${options.retailer}`)
  if (options.month) console.log(`Month: ${options.month}`)
  console.log('========================================\n')

  try {
    const retailers = await getEnabledRetailers(options)

    if (retailers.length === 0) {
      console.log('No enabled retailers found. Exiting.')
      return
    }

    console.log(`Found ${retailers.length} enabled retailer(s):`)
    retailers.forEach((retailer) => console.log(`  - ${retailer}`))
    console.log('')

    for (const retailerId of retailers) {
      console.log(`\nProcessing ${retailerId}...`)
      const periods = await identifyPeriodsToProcess(retailerId, options)

      if (periods.length === 0) {
        console.log('  All domain metrics up to date')
        continue
      }

      console.log(`  Found ${periods.length} period(s) to process`)

      for (const period of periods) {
        const periodLabel = formatPeriodLabel(period.periodStart)
        console.log(`\n  Period: ${periodLabel}`)
        console.log(`    Range: ${period.periodStart} to ${period.periodEnd}`)
        console.log(`    Snapshot updated: ${period.lastUpdated}`)

        const { metrics, errors } = await buildMetricsForPeriod(
          retailerId,
          period.periodStart,
          period.periodEnd
        )

        if (errors.length > 0) {
          errors.forEach((error) => console.warn(`    Warning: ${error}`))
        }

        if (metrics.length === 0) {
          console.log('    No metrics generated for this period')
          continue
        }

        if (options.dryRun) {
          console.log(`    [DRY RUN] Would write ${metrics.length} metrics`)
          continue
        }

        const insertedCount = await transaction(async (client) => insertDomainMetrics(client, metrics))
        console.log(`    Generated ${insertedCount} metrics`)
      }
    }

    console.log('\n========================================')
    console.log('Domain metrics generation complete')
    console.log('========================================')
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
