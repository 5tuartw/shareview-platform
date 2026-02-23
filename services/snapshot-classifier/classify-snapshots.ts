import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment from project root BEFORE importing db
config({ path: resolve(process.cwd(), '.env.local') })

import { Pool } from 'pg'
import { classifyKeywordsSnapshot } from './classifiers/keywords'
import { classifyCategorySnapshot } from './classifiers/categories'
import { classifyProductSnapshot } from './classifiers/products'
import type { ClassifierOptions, ClassificationResult, SnapshotToClassify } from './types'

const SOURCE_DB_MODE = process.env.SOURCE_DB_MODE || 'tunnel'

const getSourceDbHost = () => {
  if (SOURCE_DB_MODE === 'direct') {
    return process.env.SOURCE_DB_DIRECT_HOST || '10.2.0.2'
  }
  return process.env.SOURCE_DB_TUNNEL_HOST || '127.0.0.1'
}

const getSourceDbPort = () => {
  if (SOURCE_DB_MODE === 'direct') {
    return parseInt(process.env.SOURCE_DB_DIRECT_PORT || '8007')
  }
  return parseInt(process.env.SOURCE_DB_TUNNEL_PORT || '18007')
}

const SOURCE_DB_CONFIG = {
  host: getSourceDbHost(),
  port: getSourceDbPort(),
  user: process.env.SOURCE_DB_USER || 'postgres',
  password: process.env.SOURCE_DB_PASS,
  database: process.env.SOURCE_DB_NAME || 'acc_mgmt',
}

const SV_DB_CONFIG = {
  host: process.env.SV_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER || process.env.SV_DBUSER || 'sv_user',
  password: process.env.SV_DB_PASS || process.env.SV_DBPASSWORD,
  database: process.env.SV_DB_NAME || process.env.SV_DBNAME || 'shareview',
}

let sourcePool: Pool | null = null
let targetPool: Pool | null = null

const getSourcePool = (): Pool => {
  if (!sourcePool) {
    sourcePool = new Pool(SOURCE_DB_CONFIG)
  }
  return sourcePool
}

const getTargetPool = (): Pool => {
  if (!targetPool) {
    targetPool = new Pool(SV_DB_CONFIG)
  }
  return targetPool
}

const closePools = async (): Promise<void> => {
  if (sourcePool) {
    await sourcePool.end()
    sourcePool = null
  }
  if (targetPool) {
    await targetPool.end()
    targetPool = null
  }
}

const getMonthEnd = (monthStart: string): string => {
  const [year, month] = monthStart.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

const getSnapshotsToClassify = async (options: ClassifierOptions): Promise<SnapshotToClassify[]> => {
  const pool = getTargetPool()
  const params: Array<string> = []

  let sql = `
    SELECT ks.id, ks.retailer_id, ks.range_start, ks.range_end
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
    WHERE ks.range_type = 'month'
      AND (
        ks.classified_at IS NULL OR ks.classified_at < ks.last_updated OR
        cs.classified_at IS NULL OR cs.classified_at < cs.last_updated OR
        ps.classified_at IS NULL OR ps.classified_at < ps.last_updated
      )
  `

  if (options.retailer) {
    params.push(options.retailer)
    sql += ` AND ks.retailer_id = $${params.length}`
  }

  if (options.month) {
    const periodStart = `${options.month}-01`
    const periodEnd = getMonthEnd(periodStart)
    params.push(periodStart, periodEnd)
    sql += ` AND ks.range_start = $${params.length - 1} AND ks.range_end = $${params.length}`
  }

  sql += ` ORDER BY range_start DESC`

  const result = await pool.query<{
    id: number
    retailer_id: string
    range_start: string | Date
    range_end: string | Date
  }>(sql, params)

  const toDateString = (value: string | Date): string => {
    if (typeof value === 'string') return value
    return value.toISOString().slice(0, 10)
  }

  return result.rows.map((row) => ({
    id: row.id,
    retailerId: row.retailer_id,
    rangeStart: toDateString(row.range_start),
    rangeEnd: toDateString(row.range_end),
  }))
}

export const classifySnapshots = async (options: ClassifierOptions = {}): Promise<ClassificationResult[]> => {
  console.log('========================================')
  console.log('Snapshot Classifier')
  console.log('========================================')
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Source DB: ${SOURCE_DB_MODE} (${SOURCE_DB_CONFIG.host}:${SOURCE_DB_CONFIG.port})`)
  if (options.retailer) console.log(`Retailer: ${options.retailer}`)
  if (options.month) console.log(`Month: ${options.month}`)
  console.log('========================================\n')

  const results: ClassificationResult[] = []

  try {
    const snapshots = await getSnapshotsToClassify(options)
    console.log(`Found ${snapshots.length} snapshot(s) to classify\n`)

    for (const snapshot of snapshots) {
      const monthLabel = snapshot.rangeStart.slice(0, 7)
      console.log(`Processing ${snapshot.retailerId} (${monthLabel})`)

      try {
        const keywordResult = await classifyKeywordsSnapshot(
          snapshot.retailerId,
          snapshot.rangeStart,
          snapshot.rangeEnd,
          getSourcePool(),
          getTargetPool(),
          { dryRun: options.dryRun }
        )

        const categoryResult = await classifyCategorySnapshot(
          snapshot.retailerId,
          snapshot.rangeStart,
          snapshot.rangeEnd,
          getSourcePool(),
          getTargetPool(),
          { dryRun: options.dryRun }
        )

        const productResult = await classifyProductSnapshot(
          snapshot.retailerId,
          snapshot.rangeStart,
          snapshot.rangeEnd,
          getSourcePool(),
          getTargetPool(),
          { dryRun: options.dryRun }
        )

        results.push(keywordResult, categoryResult, productResult)

        console.log(
          `  Keywords: ${keywordResult.operation} (star ${keywordResult.counts.tier_star_count}, strong ${keywordResult.counts.tier_strong_count})`
        )
        console.log(
          `  Categories: ${categoryResult.operation} (healthy ${categoryResult.counts.health_healthy_count}, star ${categoryResult.counts.health_star_count})`
        )
        console.log(
          `  Products: ${productResult.operation} (star ${productResult.counts.star_count}, good ${productResult.counts.good_count})\n`
        )
      } catch (error) {
        console.error(`  Failed to classify ${snapshot.retailerId} ${monthLabel}:`, error)
      }
    }

    console.log('========================================')
    console.log('Snapshot classification complete')
    console.log(`Total classifications: ${results.length}`)
    console.log('========================================')

    return results
  } catch (error) {
    console.error('Error classifying snapshots:', error)
    throw error
  } finally {
    await closePools()
  }
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const options: ClassifierOptions = {}

  for (const arg of args) {
    if (arg.startsWith('--retailer=')) {
      options.retailer = arg.split('=')[1]
    } else if (arg.startsWith('--month=')) {
      options.month = arg.split('=')[1]
    } else if (arg === '--dry-run') {
      options.dryRun = true
    }
  }

  classifySnapshots(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}
