import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { query, queryAnalytics, transaction, closePool } from '../../lib/db'
import { resolveSourceRetailerIdForDomain } from '../../lib/retailer-source-overrides'

type Domain = 'overview' | 'keywords' | 'categories' | 'products' | 'auctions'
type Granularity = 'month' | 'week'
const ALL_DOMAINS: Domain[] = ['overview', 'keywords', 'categories', 'products', 'auctions']

interface RefreshOptions {
  retailer?: string
  dryRun?: boolean
  domains?: Domain[]
  continueOnError?: boolean
}

interface RetailerMapping {
  retailer_id: string
  source_retailer_id: string
}

interface AvailabilityRow {
  retailerId: string
  domain: Domain
  granularity: Granularity
  period: string
  periodStart: string
  periodEnd: string
  actualDataStart: string | null
  actualDataEnd: string | null
  sourceSystem: 'shareview' | 'rsr'
}

interface RefreshSummary {
  retailerCount: number
  deletedCount: number
  upsertedCount: number
  byBucket: Record<string, number>
}

const toIsoDate = (value: string | Date | null): string | null => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const getRetailerMappings = async (options: RefreshOptions): Promise<RetailerMapping[]> => {
  const result = await query<RetailerMapping>(
    `SELECT retailer_id,
            COALESCE(NULLIF(source_retailer_id, ''), retailer_id) AS source_retailer_id
     FROM retailers
     WHERE ($1::text IS NULL OR retailer_id = $1)
     ORDER BY retailer_id ASC`,
    [options.retailer ?? null]
  )

  return result.rows
}

const buildSourceToRetailerMap = (mappings: RetailerMapping[]): Map<string, string[]> => {
  const sourceToRetailers = new Map<string, string[]>()
  for (const mapping of mappings) {
    const existing = sourceToRetailers.get(mapping.source_retailer_id) ?? []
    existing.push(mapping.retailer_id)
    sourceToRetailers.set(mapping.source_retailer_id, existing)
  }
  return sourceToRetailers
}

const buildOverviewSourceToRetailerMap = (mappings: RetailerMapping[]): Map<string, string[]> => {
  const sourceToRetailers = new Map<string, string[]>()
  for (const mapping of mappings) {
    const overviewSourceId = resolveSourceRetailerIdForDomain(
      mapping.retailer_id,
      mapping.source_retailer_id,
      'overview'
    )
    const existing = sourceToRetailers.get(overviewSourceId) ?? []
    existing.push(mapping.retailer_id)
    sourceToRetailers.set(overviewSourceId, existing)
  }
  return sourceToRetailers
}

const collectOverviewMonthlyAvailability = async (
  sourceRetailerIds: string[],
  sourceToRetailers: Map<string, string[]>
): Promise<AvailabilityRow[]> => {
  if (sourceRetailerIds.length === 0) return []

  const result = await queryAnalytics<{
    source_retailer_id: string
    period: string
    period_start: string | Date
    period_end: string | Date
  }>(
    `SELECT retailer_id AS source_retailer_id,
            month_year AS period,
            TO_DATE(month_year, 'YYYY-MM')::date AS period_start,
            (TO_DATE(month_year, 'YYYY-MM') + INTERVAL '1 month - 1 day')::date AS period_end
     FROM monthly_archive
     WHERE retailer_id = ANY($1::text[])
     GROUP BY retailer_id, month_year
     ORDER BY retailer_id, month_year`,
    [sourceRetailerIds]
  )

  const rows: AvailabilityRow[] = []
  for (const row of result.rows) {
    const retailerIds = sourceToRetailers.get(row.source_retailer_id) ?? []
    for (const retailerId of retailerIds) {
      rows.push({
        retailerId,
        domain: 'overview',
        granularity: 'month',
        period: row.period,
        periodStart: toIsoDate(row.period_start) ?? row.period,
        periodEnd: toIsoDate(row.period_end) ?? row.period,
        actualDataStart: null,
        actualDataEnd: null,
        sourceSystem: 'rsr',
      })
    }
  }

  return rows
}

const collectOverviewWeeklyAvailability = async (
  sourceRetailerIds: string[],
  sourceToRetailers: Map<string, string[]>
): Promise<AvailabilityRow[]> => {
  if (sourceRetailerIds.length === 0) return []

  const result = await queryAnalytics<{
    source_retailer_id: string
    period: string
    period_start: string | Date
    period_end: string | Date
  }>(
    `SELECT rm.retailer_id AS source_retailer_id,
            TO_CHAR(rm.period_start_date, 'YYYY-MM-DD') AS period,
            rm.period_start_date::date AS period_start,
            rm.period_start_date::date AS period_end
     FROM retailer_metrics rm
     JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
     WHERE rm.retailer_id = ANY($1::text[])
       AND rm.period_start_date IS NOT NULL
       AND fr.fetch_type = '13_weeks'
     GROUP BY rm.retailer_id, rm.period_start_date
     ORDER BY rm.retailer_id, rm.period_start_date`,
    [sourceRetailerIds]
  )

  const rows: AvailabilityRow[] = []
  for (const row of result.rows) {
    const retailerIds = sourceToRetailers.get(row.source_retailer_id) ?? []
    for (const retailerId of retailerIds) {
      rows.push({
        retailerId,
        domain: 'overview',
        granularity: 'week',
        period: row.period,
        periodStart: toIsoDate(row.period_start) ?? row.period,
        periodEnd: toIsoDate(row.period_end) ?? row.period,
        actualDataStart: toIsoDate(row.period_start),
        actualDataEnd: toIsoDate(row.period_end),
        sourceSystem: 'rsr',
      })
    }
  }

  return rows
}

const collectSnapshotMonthlyAvailability = async (
  retailerIds: string[],
  domain: Exclude<Domain, 'overview'>,
  tableName: 'keywords_snapshots' | 'category_performance_snapshots' | 'product_performance_snapshots' | 'auction_insights_snapshots'
): Promise<AvailabilityRow[]> => {
  if (retailerIds.length === 0) return []

  const result = await query<{
    retailer_id: string
    period: string
    period_start: string | Date
    period_end: string | Date
    actual_data_start: string | Date | null
    actual_data_end: string | Date | null
  }>(
    `SELECT retailer_id,
            TO_CHAR(range_start, 'YYYY-MM') AS period,
            range_start::date AS period_start,
            range_end::date AS period_end,
            MIN(actual_data_start)::date AS actual_data_start,
            MAX(actual_data_end)::date AS actual_data_end
     FROM ${tableName}
     WHERE retailer_id = ANY($1::text[])
       AND range_type = 'month'
     GROUP BY retailer_id, range_start, range_end
     ORDER BY retailer_id, range_start`,
    [retailerIds]
  )

  return result.rows.map((row) => ({
    retailerId: row.retailer_id,
    domain,
    granularity: 'month',
    period: row.period,
    periodStart: toIsoDate(row.period_start) ?? row.period,
    periodEnd: toIsoDate(row.period_end) ?? row.period,
    actualDataStart: toIsoDate(row.actual_data_start),
    actualDataEnd: toIsoDate(row.actual_data_end),
    sourceSystem: 'shareview',
  }))
}

const upsertAvailabilityRows = async (
  execute: (text: string, params?: unknown[]) => Promise<{ rowCount: number | null }>,
  rows: AvailabilityRow[]
): Promise<number> => {
  if (rows.length === 0) return 0

  let upserted = 0
  const chunks = chunkArray(rows, 400)

  for (const chunk of chunks) {
    const values: unknown[] = []
    const placeholders: string[] = []

    for (const row of chunk) {
      const base = values.length
      values.push(
        row.retailerId,
        row.domain,
        row.granularity,
        row.period,
        row.periodStart,
        row.periodEnd,
        row.actualDataStart,
        row.actualDataEnd,
        row.sourceSystem
      )

      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::date, $${base + 6}::date, $${base + 7}::date, $${base + 8}::date, $${base + 9})`
      )
    }

    const result = await execute(
      `INSERT INTO retailer_data_availability (
          retailer_id,
          domain,
          granularity,
          period,
          period_start,
          period_end,
          actual_data_start,
          actual_data_end,
          source_system
        )
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (retailer_id, domain, granularity, period)
       DO UPDATE SET
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         actual_data_start = EXCLUDED.actual_data_start,
         actual_data_end = EXCLUDED.actual_data_end,
         source_system = EXCLUDED.source_system,
         refreshed_at = NOW(),
         updated_at = NOW()`,
      values
    )

    upserted += result.rowCount ?? 0
  }

  return upserted
}

export const refreshDataAvailability = async (options: RefreshOptions = {}): Promise<RefreshSummary> => {
  const mappings = await getRetailerMappings(options)
  if (mappings.length === 0) {
    return {
      retailerCount: 0,
      deletedCount: 0,
      upsertedCount: 0,
      byBucket: {},
    }
  }

  const retailerIds = mappings.map((m) => m.retailer_id)
  const sourceToRetailers = buildSourceToRetailerMap(mappings)
  const overviewSourceToRetailers = buildOverviewSourceToRetailerMap(mappings)
  const sourceRetailerIds = [...new Set(mappings.map((m) => m.source_retailer_id))]
  const overviewSourceRetailerIds = [...new Set(Array.from(overviewSourceToRetailers.keys()))]

  const selectedDomains = options.domains && options.domains.length > 0
    ? options.domains
    : ALL_DOMAINS

  const runCollector = async (label: string, fn: () => Promise<AvailabilityRow[]>): Promise<AvailabilityRow[]> => {
    try {
      return await fn()
    } catch (error) {
      if (!options.continueOnError) throw error
      console.warn(`Skipping ${label} availability due to collector error`, error)
      return []
    }
  }

  const overviewMonthly = selectedDomains.includes('overview')
    ? await runCollector('overview:month', () => collectOverviewMonthlyAvailability(overviewSourceRetailerIds, overviewSourceToRetailers))
    : []

  const overviewWeekly = selectedDomains.includes('overview')
    ? await runCollector('overview:week', () => collectOverviewWeeklyAvailability(overviewSourceRetailerIds, overviewSourceToRetailers))
    : []

  const keywordMonthly = selectedDomains.includes('keywords')
    ? await runCollector('keywords:month', () => collectSnapshotMonthlyAvailability(retailerIds, 'keywords', 'keywords_snapshots'))
    : []

  const categoryMonthly = selectedDomains.includes('categories')
    ? await runCollector('categories:month', () => collectSnapshotMonthlyAvailability(retailerIds, 'categories', 'category_performance_snapshots'))
    : []

  const productMonthly = selectedDomains.includes('products')
    ? await runCollector('products:month', () => collectSnapshotMonthlyAvailability(retailerIds, 'products', 'product_performance_snapshots'))
    : []

  const auctionMonthly = selectedDomains.includes('auctions')
    ? await runCollector('auctions:month', () => collectSnapshotMonthlyAvailability(retailerIds, 'auctions', 'auction_insights_snapshots'))
    : []

  const allRows = [
    ...overviewMonthly,
    ...overviewWeekly,
    ...keywordMonthly,
    ...categoryMonthly,
    ...productMonthly,
    ...auctionMonthly,
  ]

  const byBucket: Record<string, number> = {}
  for (const row of allRows) {
    const key = `${row.domain}:${row.granularity}`
    byBucket[key] = (byBucket[key] ?? 0) + 1
  }

  if (options.dryRun) {
    return {
      retailerCount: mappings.length,
      deletedCount: 0,
      upsertedCount: allRows.length,
      byBucket,
    }
  }

  let deletedCount = 0
  let upsertedCount = 0

  const includeOverview = selectedDomains.includes('overview')
  const includeNonOverview = selectedDomains.filter((domain) => domain !== 'overview')

  await transaction(async (client) => {
    const deleteClauses: string[] = []
    const deleteParams: unknown[] = [retailerIds]

    if (includeOverview) {
      deleteClauses.push(`(domain = 'overview' AND granularity IN ('month', 'week'))`)
    }

    if (includeNonOverview.length > 0) {
      deleteParams.push(includeNonOverview)
      deleteClauses.push(`(domain = ANY($${deleteParams.length}::text[]) AND granularity = 'month')`)
    }

    const deleteResult = deleteClauses.length > 0
      ? await client.query(
          `DELETE FROM retailer_data_availability
           WHERE retailer_id = ANY($1::text[])
             AND (${deleteClauses.join(' OR ')})`,
          deleteParams
        )
      : { rowCount: 0 }

    deletedCount = deleteResult.rowCount ?? 0

    upsertedCount = await upsertAvailabilityRows(
      (text, params) => client.query(text, params),
      allRows
    )
  })

  return {
    retailerCount: mappings.length,
    deletedCount,
    upsertedCount,
    byBucket,
  }
}

const parseArgs = (args: string[]): RefreshOptions => {
  const options: RefreshOptions = {}

  const parseDomains = (value: string): Domain[] => {
    const requested = value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    const valid: Domain[] = []
    for (const item of requested) {
      if (ALL_DOMAINS.includes(item as Domain)) {
        valid.push(item as Domain)
      } else {
        throw new Error(`Invalid domain '${item}'. Valid values: ${ALL_DOMAINS.join(', ')}`)
      }
    }

    return [...new Set(valid)]
  }

  for (const arg of args) {
    if (arg.startsWith('--retailer=')) options.retailer = arg.split('=')[1]
    if (arg === '--dry-run') options.dryRun = true
    if (arg.startsWith('--domains=')) options.domains = parseDomains(arg.split('=')[1] ?? '')
    if (arg === '--continue-on-error') options.continueOnError = true
  }
  return options
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2))
  refreshDataAvailability(options)
    .then((summary) => {
      console.log('Data availability refresh complete')
      console.log(`Retailers processed : ${summary.retailerCount}`)
      console.log(`Rows deleted        : ${summary.deletedCount}`)
      console.log(`Rows upserted       : ${summary.upsertedCount}`)
      for (const [bucket, count] of Object.entries(summary.byBucket).sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`- ${bucket}: ${count}`)
      }
      process.exit(0)
    })
    .catch(async (error) => {
      console.error('Data availability refresh failed:', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await closePool()
    })
}
