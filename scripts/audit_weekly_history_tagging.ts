import { config } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { query, queryAnalytics, closePool } from '../lib/db'

config({ path: resolve(process.cwd(), '.env.local') })

interface AnalyticsCoverageRow {
  retailer_id: string
  week_tagged_weeks: number
  non_week_tagged_periods: number
  first_week_tagged: string | null
  last_week_tagged: string | null
  first_non_week_period: string | null
  last_non_week_period: string | null
}

interface ShareviewRetailerRow {
  retailer_id: string
  retailer_name: string
  source_retailer_id: string | null
  snapshot_enabled: boolean | null
  is_demo: boolean | null
}

interface CombinedRow {
  shareview_retailer_id: string
  retailer_name: string
  source_retailer_id: string
  snapshot_enabled: boolean
  is_demo: boolean
  week_tagged_weeks: number
  non_week_tagged_periods: number
  first_week_tagged: string
  last_week_tagged: string
  first_non_week_period: string
  last_non_week_period: string
  suspected_historical_untagged: boolean
}

const OUTPUT_DIR_DEFAULT = '/tmp'

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

const fetchAnalyticsCoverage = async (): Promise<Map<string, AnalyticsCoverageRow>> => {
  const sql = `
    WITH per_retailer AS (
      SELECT
        rm.retailer_id,
        COUNT(DISTINCT CASE WHEN rm.report_period LIKE '%(Week)' THEN rm.period_start_date END)::int AS week_tagged_weeks,
        COUNT(DISTINCT CASE WHEN rm.report_period NOT LIKE '%(Week)' THEN rm.period_start_date END)::int AS non_week_tagged_periods,
        MIN(CASE WHEN rm.report_period LIKE '%(Week)' THEN rm.period_start_date END)::text AS first_week_tagged,
        MAX(CASE WHEN rm.report_period LIKE '%(Week)' THEN rm.period_start_date END)::text AS last_week_tagged,
        MIN(CASE WHEN rm.report_period NOT LIKE '%(Week)' THEN rm.period_start_date END)::text AS first_non_week_period,
        MAX(CASE WHEN rm.report_period NOT LIKE '%(Week)' THEN rm.period_start_date END)::text AS last_non_week_period
      FROM retailer_metrics rm
      WHERE rm.period_start_date IS NOT NULL
      GROUP BY rm.retailer_id
    )
    SELECT *
    FROM per_retailer
  `

  const result = await queryAnalytics<AnalyticsCoverageRow>(sql)
  return new Map(result.rows.map((row) => [row.retailer_id, row]))
}

const fetchMappedRetailers = async (): Promise<ShareviewRetailerRow[]> => {
  const sql = `
    SELECT
      retailer_id,
      retailer_name,
      source_retailer_id,
      snapshot_enabled,
      is_demo
    FROM retailers
    WHERE source_retailer_id IS NOT NULL
  `

  const result = await query<ShareviewRetailerRow>(sql)
  return result.rows
}

const toCsv = (rows: CombinedRow[]): string => {
  const headers = [
    'shareview_retailer_id',
    'retailer_name',
    'source_retailer_id',
    'snapshot_enabled',
    'is_demo',
    'week_tagged_weeks',
    'non_week_tagged_periods',
    'first_week_tagged',
    'last_week_tagged',
    'first_non_week_period',
    'last_non_week_period',
    'suspected_historical_untagged',
  ]

  const escape = (value: unknown): string => {
    const text = value == null ? '' : String(value)
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push([
      row.shareview_retailer_id,
      row.retailer_name,
      row.source_retailer_id,
      row.snapshot_enabled,
      row.is_demo,
      row.week_tagged_weeks,
      row.non_week_tagged_periods,
      row.first_week_tagged,
      row.last_week_tagged,
      row.first_non_week_period,
      row.last_non_week_period,
      row.suspected_historical_untagged,
    ].map(escape).join(','))
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2))
  mkdirSync(outputDir, { recursive: true })

  const [coverageByRetailer, mappedRetailers] = await Promise.all([
    fetchAnalyticsCoverage(),
    fetchMappedRetailers(),
  ])

  const combined: CombinedRow[] = mappedRetailers.map((retailer) => {
    const sourceId = retailer.source_retailer_id ?? ''
    const coverage = coverageByRetailer.get(sourceId)

    const weekTaggedWeeks = coverage?.week_tagged_weeks ?? 0
    const nonWeekTaggedPeriods = coverage?.non_week_tagged_periods ?? 0
    const suspected = weekTaggedWeeks === 13 && nonWeekTaggedPeriods >= 12

    return {
      shareview_retailer_id: retailer.retailer_id,
      retailer_name: retailer.retailer_name,
      source_retailer_id: sourceId,
      snapshot_enabled: Boolean(retailer.snapshot_enabled),
      is_demo: Boolean(retailer.is_demo),
      week_tagged_weeks: weekTaggedWeeks,
      non_week_tagged_periods: nonWeekTaggedPeriods,
      first_week_tagged: coverage?.first_week_tagged ?? '',
      last_week_tagged: coverage?.last_week_tagged ?? '',
      first_non_week_period: coverage?.first_non_week_period ?? '',
      last_non_week_period: coverage?.last_non_week_period ?? '',
      suspected_historical_untagged: suspected,
    }
  })

  combined.sort((a, b) => {
    if (a.suspected_historical_untagged !== b.suspected_historical_untagged) {
      return a.suspected_historical_untagged ? -1 : 1
    }
    return a.shareview_retailer_id.localeCompare(b.shareview_retailer_id)
  })

  const suspectedRows = combined.filter((r) => r.suspected_historical_untagged)

  const summary = {
    generated_at: new Date().toISOString(),
    mapped_retailers: combined.length,
    suspected_historical_untagged: suspectedRows.length,
    snapshot_enabled_suspected: suspectedRows.filter((r) => r.snapshot_enabled).length,
    demo_suspected: suspectedRows.filter((r) => r.is_demo).length,
  }

  const jsonPath = join(outputDir, 'weekly_history_tagging_audit.json')
  const csvPath = join(outputDir, 'weekly_history_tagging_audit.csv')
  const suspectedCsvPath = join(outputDir, 'weekly_history_tagging_suspected.csv')

  writeFileSync(jsonPath, JSON.stringify({ summary, rows: combined }, null, 2))
  writeFileSync(csvPath, toCsv(combined))
  writeFileSync(suspectedCsvPath, toCsv(suspectedRows))

  console.log('Weekly history tagging audit complete')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`JSON: ${jsonPath}`)
  console.log(`CSV: ${csvPath}`)
  console.log(`Suspected only CSV: ${suspectedCsvPath}`)
}

main()
  .catch((error) => {
    console.error('Audit failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await closePool()
  })
