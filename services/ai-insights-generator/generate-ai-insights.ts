import { config } from 'dotenv'
import { resolve } from 'path'
import type { PoolClient } from 'pg'
import { query, transaction, closePool } from '../../lib/db'
import type { AIInsightRecord, GenerationResult, GeneratorOptions } from './types'
import { generateInsightsPanel } from './generators/insights-panel'
import { generateMarketAnalysis } from './generators/market-analysis'
import { generateRecommendations } from './generators/recommendations'

config({ path: resolve(__dirname, '../../.env.local') })

interface PeriodToGenerate {
  retailerId: string
  periodStart: string
  periodEnd: string
  lastUpdated: string
}

interface KeywordsSnapshot {
  totalKeywords: number
  overallCtr: number
  overallCvr: number
  tierStarCount: number
  tierStrongCount: number
  tierUnderperformingCount: number
  tierPoorCount: number
}

interface CategorySnapshot {
  totalCategories: number
  overallCtr: number
  overallCvr: number
  healthHealthyCount: number
  healthStarCount: number
}

interface ProductSnapshot {
  totalProducts: number
  starCount: number
  goodCount: number
  underperformerCount: number
  wastedClicksPercentage: number
  top1Share: number
}

const PAGE_TYPE = 'overview'
const TAB_NAME = 'insights'
const PERIOD_TYPE = 'month'

const toNumber = (value: number | string | null, fallback = 0): number => {
  if (value === null || value === undefined) return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

const toDateString = (value: string | Date): string => {
  if (typeof value === 'string') return value
  return value.toISOString().slice(0, 10)
}

const parseArgs = (): GeneratorOptions => {
  const args = process.argv.slice(2)
  const options: GeneratorOptions = {}

  for (const arg of args) {
    if (arg.startsWith('--retailer=')) {
      options.retailer = arg.split('=')[1]
    } else if (arg.startsWith('--month=')) {
      options.month = arg.split('=')[1]
    } else if (arg === '--dry-run') {
      options.dryRun = true
    }
  }

  return options
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

const identifyPeriodsToGenerate = async (retailerId: string, options: GeneratorOptions): Promise<PeriodToGenerate[]> => {
  const params: Array<string> = [retailerId, PAGE_TYPE, TAB_NAME]
  let sql = `
    SELECT
      ks.range_start AS period_start,
      ks.range_end AS period_end,
      GREATEST(
        ks.last_updated,
        COALESCE(cs.last_updated, ks.last_updated),
        COALESCE(ps.last_updated, ks.last_updated)
      ) AS last_updated,
      ai.updated_at
    FROM keywords_snapshots ks
    LEFT JOIN category_performance_snapshots cs
      ON cs.retailer_id = ks.retailer_id
      AND cs.range_type = ks.range_type
      AND cs.range_start = ks.range_start
      AND cs.range_end = ks.range_end
    LEFT JOIN product_performance_snapshots ps
      ON ps.retailer_id = ks.retailer_id
      AND ps.range_type = ks.range_type
      AND ps.range_start = ks.range_start
      AND ps.range_end = ks.range_end
    LEFT JOIN (
      SELECT
        retailer_id,
        page_type,
        tab_name,
        period_start,
        period_end,
        MAX(updated_at) AS updated_at
      FROM ai_insights
      WHERE retailer_id = $1
        AND page_type = $2
        AND tab_name = $3
      GROUP BY retailer_id, page_type, tab_name, period_start, period_end
    ) ai
      ON ai.retailer_id = ks.retailer_id
      AND ai.period_start = ks.range_start
      AND ai.period_end = ks.range_end
    WHERE ks.retailer_id = $1
      AND ks.range_type = 'month'
      AND (
        ai.updated_at IS NULL OR
        GREATEST(
          ks.last_updated,
          COALESCE(cs.last_updated, ks.last_updated),
          COALESCE(ps.last_updated, ks.last_updated)
        ) > ai.updated_at
      )
  `

  if (options.month) {
    const periodStart = `${options.month}-01`
    const periodEnd = getPeriodEnd(periodStart)
    params.push(periodStart, periodEnd)
    sql += ` AND ks.range_start = $${params.length - 1} AND ks.range_end = $${params.length}`
  }

  sql += ` ORDER BY ks.range_start DESC`

  const result = await query<{
    period_start: string | Date
    period_end: string | Date
    last_updated: string
  }>(sql, params)

  return result.rows.map((row) => ({
    retailerId,
    periodStart: toDateString(row.period_start),
    periodEnd: toDateString(row.period_end),
    lastUpdated: row.last_updated,
  }))
}

const createGenerationJob = async (period: PeriodToGenerate): Promise<number> => {
  const result = await query<{ id: number }>(
    `
    INSERT INTO insights_generation_jobs (
      retailer_id,
      page_type,
      tab_name,
      period_type,
      period_start,
      period_end,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'queued')
    RETURNING id
    `,
    [
      period.retailerId,
      PAGE_TYPE,
      TAB_NAME,
      PERIOD_TYPE,
      period.periodStart,
      period.periodEnd,
    ]
  )

  return result.rows[0].id
}

const updateJobStatus = async (jobId: number, status: string, errorMessage?: string): Promise<void> => {
  const updates: string[] = ['status = $2']
  const params: Array<string | number | null> = [jobId, status]

  if (status === 'running') {
    updates.push('started_at = NOW()')
  }

  if (status === 'completed' || status === 'failed') {
    updates.push('completed_at = NOW()')
  }

  if (errorMessage !== undefined) {
    params.push(errorMessage)
    updates.push(`error_message = $${params.length}`)
  }

  const sql = `UPDATE insights_generation_jobs SET ${updates.join(', ')} WHERE id = $1`
  await query(sql, params)
}

const fetchKeywordsSnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<KeywordsSnapshot | null> => {
  const result = await query<{
    total_keywords: number | string | null
    overall_ctr: number | string | null
    overall_cvr: number | string | null
    tier_star_count: number | string | null
    tier_strong_count: number | string | null
    tier_underperforming_count: number | string | null
    tier_poor_count: number | string | null
  }>(
    `
    SELECT
      total_keywords,
      overall_ctr,
      overall_cvr,
      tier_star_count,
      tier_strong_count,
      tier_underperforming_count,
      tier_poor_count
    FROM keywords_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    `,
    [retailerId, periodStart, periodEnd]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    totalKeywords: toNumber(row.total_keywords),
    overallCtr: toNumber(row.overall_ctr),
    overallCvr: toNumber(row.overall_cvr),
    tierStarCount: toNumber(row.tier_star_count),
    tierStrongCount: toNumber(row.tier_strong_count),
    tierUnderperformingCount: toNumber(row.tier_underperforming_count),
    tierPoorCount: toNumber(row.tier_poor_count),
  }
}

const fetchCategorySnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<CategorySnapshot | null> => {
  const result = await query<{
    total_categories: number | string | null
    overall_ctr: number | string | null
    overall_cvr: number | string | null
    health_healthy_count: number | string | null
    health_star_count: number | string | null
  }>(
    `
    SELECT
      total_categories,
      overall_ctr,
      overall_cvr,
      health_healthy_count,
      health_star_count
    FROM category_performance_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    `,
    [retailerId, periodStart, periodEnd]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    totalCategories: toNumber(row.total_categories),
    overallCtr: toNumber(row.overall_ctr),
    overallCvr: toNumber(row.overall_cvr),
    healthHealthyCount: toNumber(row.health_healthy_count),
    healthStarCount: toNumber(row.health_star_count),
  }
}

const fetchProductSnapshot = async (retailerId: string, periodStart: string, periodEnd: string): Promise<ProductSnapshot | null> => {
  const result = await query<{
    total_products: number | string | null
    star_count: number | string | null
    good_count: number | string | null
    underperformer_count: number | string | null
    wasted_clicks_percentage: number | string | null
    top_1_pct_conversions_share: number | string | null
  }>(
    `
    SELECT
      total_products,
      star_count,
      good_count,
      underperformer_count,
      wasted_clicks_percentage,
      top_1_pct_conversions_share
    FROM product_performance_snapshots
    WHERE retailer_id = $1
      AND range_type = 'month'
      AND range_start = $2
      AND range_end = $3
    `,
    [retailerId, periodStart, periodEnd]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    totalProducts: toNumber(row.total_products),
    starCount: toNumber(row.star_count),
    goodCount: toNumber(row.good_count),
    underperformerCount: toNumber(row.underperformer_count),
    wastedClicksPercentage: toNumber(row.wasted_clicks_percentage),
    top1Share: toNumber(row.top_1_pct_conversions_share),
  }
}

const insertAIInsights = async (client: PoolClient, records: AIInsightRecord[]): Promise<number> => {
  if (records.length === 0) return 0

  const values = records.map((_, index) => {
    const baseIndex = index * 15
    return `(
      $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4},
      $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8},
      $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12},
      $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15}
    )`
  })

  const params = records.flatMap((record) => [
    record.retailerId,
    record.pageType,
    record.tabName,
    record.periodType,
    record.periodStart,
    record.periodEnd,
    record.insightType,
    JSON.stringify(record.insightData),
    record.modelName,
    record.modelVersion,
    record.confidenceScore,
    record.promptHash,
    record.status,
    record.isActive,
    record.reviewNotes ?? null,
  ])

  const sql = `
    INSERT INTO ai_insights (
      retailer_id,
      page_type,
      tab_name,
      period_type,
      period_start,
      period_end,
      insight_type,
      insight_data,
      model_name,
      model_version,
      confidence_score,
      prompt_hash,
      status,
      is_active,
      review_notes
    ) VALUES ${values.join(',')}
    ON CONFLICT (retailer_id, page_type, tab_name, period_start, period_end, insight_type)
    DO UPDATE SET
      insight_data = EXCLUDED.insight_data,
      model_name = EXCLUDED.model_name,
      model_version = EXCLUDED.model_version,
      confidence_score = EXCLUDED.confidence_score,
      prompt_hash = EXCLUDED.prompt_hash,
      status = EXCLUDED.status,
      is_active = EXCLUDED.is_active,
      review_notes = EXCLUDED.review_notes,
      approved_by = NULL,
      approved_at = NULL,
      published_by = NULL,
      published_at = NULL,
      updated_at = NOW()
  `

  await client.query(sql, params)
  return records.length
}

const buildInsightsForPeriod = async (
  retailerId: string,
  periodStart: string,
  periodEnd: string
): Promise<GenerationResult> => {
  const errors: string[] = []

  const [keywordsSnapshot, categorySnapshot, productSnapshot] = await Promise.all([
    fetchKeywordsSnapshot(retailerId, periodStart, periodEnd),
    fetchCategorySnapshot(retailerId, periodStart, periodEnd),
    fetchProductSnapshot(retailerId, periodStart, periodEnd),
  ])

  if (!keywordsSnapshot) {
    errors.push('Missing keywords snapshot for insight panel generation.')
  }

  const insights: AIInsightRecord[] = []

  if (keywordsSnapshot) {
    insights.push({
      retailerId,
      pageType: PAGE_TYPE,
      tabName: TAB_NAME,
      periodType: PERIOD_TYPE,
      periodStart,
      periodEnd,
      insightType: 'insight_panel',
      insightData: generateInsightsPanel({
        totalKeywords: keywordsSnapshot.totalKeywords,
        overallCtr: keywordsSnapshot.overallCtr,
        overallCvr: keywordsSnapshot.overallCvr,
        tierStarCount: keywordsSnapshot.tierStarCount,
        tierStrongCount: keywordsSnapshot.tierStrongCount,
        tierUnderperformingCount: keywordsSnapshot.tierUnderperformingCount,
        tierPoorCount: keywordsSnapshot.tierPoorCount,
      }),
      modelName: 'placeholder',
      modelVersion: 'v1',
      confidenceScore: 0.5,
      promptHash: null,
      status: 'pending',
      isActive: false,
    })
  }

  if (!categorySnapshot) {
    errors.push('Missing category snapshot for market analysis generation.')
  } else {
    insights.push({
      retailerId,
      pageType: PAGE_TYPE,
      tabName: TAB_NAME,
      periodType: PERIOD_TYPE,
      periodStart,
      periodEnd,
      insightType: 'market_analysis',
      insightData: generateMarketAnalysis({
        totalCategories: categorySnapshot.totalCategories,
        overallCtr: categorySnapshot.overallCtr,
        overallCvr: categorySnapshot.overallCvr,
        healthyCount: categorySnapshot.healthHealthyCount,
        starCount: categorySnapshot.healthStarCount,
      }),
      modelName: 'placeholder',
      modelVersion: 'v1',
      confidenceScore: 0.5,
      promptHash: null,
      status: 'pending',
      isActive: false,
    })
  }

  if (!productSnapshot) {
    errors.push('Missing product snapshot for recommendations generation.')
  } else {
    insights.push({
      retailerId,
      pageType: PAGE_TYPE,
      tabName: TAB_NAME,
      periodType: PERIOD_TYPE,
      periodStart,
      periodEnd,
      insightType: 'recommendation',
      insightData: generateRecommendations({
        totalProducts: productSnapshot.totalProducts,
        starCount: productSnapshot.starCount,
        goodCount: productSnapshot.goodCount,
        underperformerCount: productSnapshot.underperformerCount,
        wastedClicksPercentage: productSnapshot.wastedClicksPercentage,
        top1Share: productSnapshot.top1Share,
      }),
      modelName: 'placeholder',
      modelVersion: 'v1',
      confidenceScore: 0.5,
      promptHash: null,
      status: 'pending',
      isActive: false,
    })
  }

  return { insights, errors }
}

const generateInsights = async (options: GeneratorOptions): Promise<void> => {
  console.log('========================================')
  console.log('AI Insights Generator')
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
      const periods = await identifyPeriodsToGenerate(retailerId, options)

      if (periods.length === 0) {
        console.log('  No periods to generate.')
        continue
      }

      console.log(`  Found ${periods.length} period(s) to generate`) 

      for (const period of periods) {
        const periodLabel = new Date(period.periodStart).toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
        })

        console.log(`\n  Period: ${periodLabel}`)
        console.log(`    Range: ${period.periodStart} to ${period.periodEnd}`)
        console.log(`    Snapshot updated: ${period.lastUpdated}`)

        if (options.dryRun) {
          const result = await buildInsightsForPeriod(retailerId, period.periodStart, period.periodEnd)
          console.log(`    Dry run: would generate ${result.insights.length} insights`)
          result.errors.forEach((error) => console.warn(`    Warning: ${error}`))
          continue
        }

        let jobId: number | undefined

        try {
          jobId = await createGenerationJob(period)
          await updateJobStatus(jobId, 'running')

          const result = await buildInsightsForPeriod(retailerId, period.periodStart, period.periodEnd)

          if (result.errors.length > 0) {
            result.errors.forEach((error) => console.warn(`    Warning: ${error}`))
          }

          const inserted = await transaction(async (client) => {
            return insertAIInsights(client, result.insights)
          })

          console.log(`    Generated ${inserted} insights`)
          await updateJobStatus(jobId, 'completed')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          console.error(`    Failed to generate insights: ${message}`)
          if (jobId) {
            await updateJobStatus(jobId, 'failed', message)
          }
        }
      }
    }

    console.log('\n========================================')
    console.log('AI insights generation complete')
    console.log('========================================')
  } finally {
    await closePool()
  }
}

if (require.main === module) {
  const options = parseArgs()
  generateInsights(options).catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
