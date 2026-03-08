import { config } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'
import { queryAnalytics, closePool } from '../lib/db'

config({ path: resolve(process.cwd(), '.env.local') })

type SourceDomain = 'keywords' | 'category_performance' | 'product_performance'

interface SourceDomainLastUpdated {
  domain: SourceDomain
  last_updated: string | null
  total_rows: string
}

interface SourceDomainToday {
  domain: SourceDomain
  rows_today: string
  retailers_today: number
  latest_fetch_datetime: string | null
}

interface OverviewDomainToday {
  domain: 'retailer_metrics_13_weeks' | 'monthly_archive'
  rows_today: string
  retailers_today: number
  latest_fetch_datetime: string | null
}

interface UpdatedDaysRow {
  domain: SourceDomain
  retailer_id: string
  latest_fetch_datetime: string
  updated_days: number
  min_insight_date: string
  max_insight_date: string
  rows_in_latest_fetch: string
}

interface UpdatedDaysSummary {
  retailers: number
  minDays: number
  maxDays: number
  avgDays: number
}

const OUTPUT_DIR_DEFAULT = '/tmp'

const SOURCE_DB_MODE = process.env.SOURCE_DB_MODE || 'tunnel'
const SOURCE_DB_HOST = SOURCE_DB_MODE === 'direct'
  ? (process.env.SOURCE_DB_DIRECT_HOST || '10.2.0.2')
  : (process.env.SOURCE_DB_TUNNEL_HOST || '127.0.0.1')
const SOURCE_DB_PORT = parseInt(
  SOURCE_DB_MODE === 'direct'
    ? (process.env.SOURCE_DB_DIRECT_PORT || '8007')
    : (process.env.SOURCE_DB_TUNNEL_PORT || '18007'),
  10
)

const sourcePool = new Pool({
  host: SOURCE_DB_HOST,
  port: SOURCE_DB_PORT,
  user: process.env.SOURCE_DB_USER || 'postgres',
  password: process.env.SOURCE_DB_PASS,
  database: process.env.SOURCE_DB_NAME || 'acc_mgmt',
  connectionTimeoutMillis: 10000,
})

const parseArgs = (args: string[]): { outputDir: string } => {
  let outputDir = OUTPUT_DIR_DEFAULT

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg.startsWith('--output-dir=')) {
      outputDir = arg.split('=')[1]
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      outputDir = args[i + 1]
      i += 1
    }
  }

  return { outputDir }
}

const getSourceDomainLastUpdated = async (): Promise<SourceDomainLastUpdated[]> => {
  const sql = `
    SELECT 'category_performance' AS domain,
           MAX(fetch_datetime)::text AS last_updated,
           COUNT(*)::bigint AS total_rows
    FROM category_performance
    UNION ALL
    SELECT 'keywords' AS domain,
           MAX(fetch_datetime)::text AS last_updated,
           COUNT(*)::bigint AS total_rows
    FROM keywords
    UNION ALL
    SELECT 'product_performance' AS domain,
           MAX(fetch_datetime)::text AS last_updated,
           COUNT(*)::bigint AS total_rows
    FROM product_performance
    ORDER BY domain
  `

  const result = await sourcePool.query<SourceDomainLastUpdated>(sql)
  return result.rows
}

const getSourceDomainTodayUpdates = async (): Promise<SourceDomainToday[]> => {
  const sql = `
    SELECT 'category_performance' AS domain,
           COUNT(*)::bigint AS rows_today,
           COUNT(DISTINCT retailer_id)::int AS retailers_today,
           MAX(fetch_datetime)::text AS latest_fetch_datetime
    FROM category_performance
    WHERE fetch_datetime >= CURRENT_DATE
      AND fetch_datetime < CURRENT_DATE + INTERVAL '1 day'
    UNION ALL
    SELECT 'keywords' AS domain,
           COUNT(*)::bigint AS rows_today,
           COUNT(DISTINCT retailer_id)::int AS retailers_today,
           MAX(fetch_datetime)::text AS latest_fetch_datetime
    FROM keywords
    WHERE fetch_datetime >= CURRENT_DATE
      AND fetch_datetime < CURRENT_DATE + INTERVAL '1 day'
    UNION ALL
    SELECT 'product_performance' AS domain,
           COUNT(*)::bigint AS rows_today,
           COUNT(DISTINCT retailer_id)::int AS retailers_today,
           MAX(fetch_datetime)::text AS latest_fetch_datetime
    FROM product_performance
    WHERE fetch_datetime >= CURRENT_DATE
      AND fetch_datetime < CURRENT_DATE + INTERVAL '1 day'
    ORDER BY domain
  `

  const result = await sourcePool.query<SourceDomainToday>(sql)
  return result.rows
}

const getOverviewTodayUpdates = async (): Promise<OverviewDomainToday[]> => {
  const sql = `
    SELECT 'retailer_metrics_13_weeks' AS domain,
           COUNT(*)::bigint AS rows_today,
           COUNT(DISTINCT rm.retailer_id)::int AS retailers_today,
           MAX(rm.fetch_datetime)::text AS latest_fetch_datetime
    FROM retailer_metrics rm
    JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
    WHERE rm.fetch_datetime >= CURRENT_DATE
      AND rm.fetch_datetime < CURRENT_DATE + INTERVAL '1 day'
      AND fr.fetch_type = '13_weeks'
    UNION ALL
    SELECT 'monthly_archive' AS domain,
           COUNT(*)::bigint AS rows_today,
           COUNT(DISTINCT ma.retailer_id)::int AS retailers_today,
           MAX(fr.fetch_datetime)::text AS latest_fetch_datetime
    FROM monthly_archive ma
    LEFT JOIN fetch_runs fr ON ma.fetch_run_id = fr.id
    WHERE fr.fetch_datetime >= CURRENT_DATE
      AND fr.fetch_datetime < CURRENT_DATE + INTERVAL '1 day'
    ORDER BY domain
  `

  const result = await queryAnalytics<OverviewDomainToday>(sql)
  return result.rows
}

const getUpdatedDaysPerRetailer = async (): Promise<UpdatedDaysRow[]> => {
  const sql = `
    WITH latest_keywords AS (
      SELECT retailer_id, MAX(fetch_datetime) AS latest_fetch
      FROM keywords
      GROUP BY retailer_id
    ), keyword_days AS (
      SELECT
        'keywords'::text AS domain,
        k.retailer_id,
        lk.latest_fetch::text AS latest_fetch_datetime,
        COUNT(DISTINCT k.insight_date)::int AS updated_days,
        MIN(k.insight_date)::text AS min_insight_date,
        MAX(k.insight_date)::text AS max_insight_date,
        COUNT(*)::bigint AS rows_in_latest_fetch
      FROM keywords k
      JOIN latest_keywords lk
        ON k.retailer_id = lk.retailer_id
       AND k.fetch_datetime = lk.latest_fetch
      GROUP BY k.retailer_id, lk.latest_fetch
    ), latest_categories AS (
      SELECT retailer_id, MAX(fetch_datetime) AS latest_fetch
      FROM category_performance
      GROUP BY retailer_id
    ), category_days AS (
      SELECT
        'category_performance'::text AS domain,
        c.retailer_id,
        lc.latest_fetch::text AS latest_fetch_datetime,
        COUNT(DISTINCT c.insight_date)::int AS updated_days,
        MIN(c.insight_date)::text AS min_insight_date,
        MAX(c.insight_date)::text AS max_insight_date,
        COUNT(*)::bigint AS rows_in_latest_fetch
      FROM category_performance c
      JOIN latest_categories lc
        ON c.retailer_id = lc.retailer_id
       AND c.fetch_datetime = lc.latest_fetch
      GROUP BY c.retailer_id, lc.latest_fetch
    ), latest_products AS (
      SELECT retailer_id, MAX(fetch_datetime) AS latest_fetch
      FROM product_performance
      GROUP BY retailer_id
    ), product_days AS (
      SELECT
        'product_performance'::text AS domain,
        p.retailer_id,
        lp.latest_fetch::text AS latest_fetch_datetime,
        COUNT(DISTINCT p.insight_date)::int AS updated_days,
        MIN(p.insight_date)::text AS min_insight_date,
        MAX(p.insight_date)::text AS max_insight_date,
        COUNT(*)::bigint AS rows_in_latest_fetch
      FROM product_performance p
      JOIN latest_products lp
        ON p.retailer_id = lp.retailer_id
       AND p.fetch_datetime = lp.latest_fetch
      GROUP BY p.retailer_id, lp.latest_fetch
    )
    SELECT * FROM keyword_days
    UNION ALL
    SELECT * FROM category_days
    UNION ALL
    SELECT * FROM product_days
    ORDER BY domain, retailer_id;
  `

  const result = await sourcePool.query<UpdatedDaysRow>(sql)
  return result.rows
}

const summariseUpdatedDays = (rows: UpdatedDaysRow[]): Record<string, UpdatedDaysSummary> => {
  const acc = rows.reduce<Record<string, { retailers: number; minDays: number; maxDays: number; totalDays: number }>>((map, row) => {
    if (!map[row.domain]) {
      map[row.domain] = {
        retailers: 0,
        minDays: Number.POSITIVE_INFINITY,
        maxDays: 0,
        totalDays: 0,
      }
    }

    map[row.domain].retailers += 1
    map[row.domain].minDays = Math.min(map[row.domain].minDays, row.updated_days)
    map[row.domain].maxDays = Math.max(map[row.domain].maxDays, row.updated_days)
    map[row.domain].totalDays += row.updated_days
    return map
  }, {})

  const out: Record<string, UpdatedDaysSummary> = {}

  for (const domain of Object.keys(acc)) {
    const item = acc[domain]
    out[domain] = {
      retailers: item.retailers,
      minDays: Number.isFinite(item.minDays) ? item.minDays : 0,
      maxDays: item.maxDays,
      avgDays: Number((item.totalDays / item.retailers).toFixed(2)),
    }
  }

  return out
}

const writeUpdatedDaysCsv = (rows: UpdatedDaysRow[], filePath: string): void => {
  const header = 'domain,retailer_id,latest_fetch_datetime,updated_days,min_insight_date,max_insight_date,rows_in_latest_fetch\n'
  const body = rows
    .map((row) => [
      row.domain,
      row.retailer_id,
      row.latest_fetch_datetime,
      row.updated_days,
      row.min_insight_date,
      row.max_insight_date,
      row.rows_in_latest_fetch,
    ].join(','))
    .join('\n')

  writeFileSync(filePath, `${header}${body}\n`, 'utf8')
}

async function run(): Promise<void> {
  const { outputDir } = parseArgs(process.argv.slice(2))
  const timestamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, 'Z')
  mkdirSync(outputDir, { recursive: true })

  const sourceLastUpdated = await getSourceDomainLastUpdated()
  const sourceTodayUpdates = await getSourceDomainTodayUpdates()
  const overviewTodayUpdates = await getOverviewTodayUpdates()
  const updatedDaysRows = await getUpdatedDaysPerRetailer()
  const updatedDaysSummary = summariseUpdatedDays(updatedDaysRows)

  const jsonPath = join(outputDir, `source-update-audit-${timestamp}.json`)
  const csvPath = join(outputDir, `source-update-audit-updated-days-${timestamp}.csv`)

  writeUpdatedDaysCsv(updatedDaysRows, csvPath)

  const report = {
    generated_at: new Date().toISOString(),
    source_db: {
      mode: SOURCE_DB_MODE,
      host: SOURCE_DB_HOST,
      port: SOURCE_DB_PORT,
    },
    source_domain_last_updated: sourceLastUpdated,
    source_domain_updates_today: sourceTodayUpdates,
    overview_domain_updates_today: overviewTodayUpdates,
    updated_days_summary: updatedDaysSummary,
    updated_days_row_count: updatedDaysRows.length,
    files: {
      json: jsonPath,
      updated_days_csv: csvPath,
    },
  }

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8')

  console.log('========================================')
  console.log('Source Update Audit')
  console.log('========================================')
  console.log(`Generated at: ${report.generated_at}`)
  console.log(`Source DB: ${SOURCE_DB_MODE} (${SOURCE_DB_HOST}:${SOURCE_DB_PORT})`)
  console.log('')

  console.log('Latest Source Fetch Per Domain:')
  for (const row of sourceLastUpdated) {
    console.log(`  - ${row.domain}: ${row.last_updated ?? 'none'} (rows=${row.total_rows})`)
  }
  console.log('')

  console.log('Today Updates (Source Domains):')
  for (const row of sourceTodayUpdates) {
    console.log(
      `  - ${row.domain}: rows_today=${row.rows_today}, retailers_today=${row.retailers_today}, latest=${row.latest_fetch_datetime ?? 'none'}`
    )
  }
  console.log('')

  console.log('Today Updates (Overview Domains):')
  for (const row of overviewTodayUpdates) {
    console.log(
      `  - ${row.domain}: rows_today=${row.rows_today}, retailers_today=${row.retailers_today}, latest=${row.latest_fetch_datetime ?? 'none'}`
    )
  }
  console.log('')

  console.log('Updated Days Per Retailer (Latest Fetch Summary):')
  for (const [domain, summary] of Object.entries(updatedDaysSummary)) {
    console.log(
      `  - ${domain}: retailers=${summary.retailers}, min_days=${summary.minDays}, max_days=${summary.maxDays}, avg_days=${summary.avgDays}`
    )
  }
  console.log('')

  console.log(`JSON report: ${jsonPath}`)
  console.log(`CSV report : ${csvPath}`)
}

run()
  .catch((error) => {
    console.error('Audit failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await sourcePool.end()
    await closePool()
  })
