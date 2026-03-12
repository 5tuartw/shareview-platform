import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment from project root before importing db.
config({ path: resolve(process.cwd(), '.env.local') })

import { query, queryAnalytics, getAnalyticsNetworkId, closePool } from '@/lib/db'
import { buildOverviewMonthlyQuery } from '@/lib/overview-monthly-sql'

type Options = {
  dryRun: boolean
  reportId?: number
  retailerId?: string
  limit?: number
}

type Candidate = {
  report_id: number
  retailer_id: string
  period_start: string
  period_end: string
}

const parseArgs = (): Options => {
  const args = process.argv.slice(2)
  const getValue = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }

  const reportIdRaw = getValue('--report-id')
  const limitRaw = getValue('--limit')

  return {
    dryRun: args.includes('--dry-run'),
    reportId: reportIdRaw ? Number.parseInt(reportIdRaw, 10) : undefined,
    retailerId: getValue('--retailer-id'),
    limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
  }
}

const toNumber = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isNaN(numeric) ? 0 : numeric
}

const percentageChange = (current: number | null, previous: number | null): number | null => {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

const buildFrozenOverview = async (
  retailerId: string,
  periodStart: string,
  periodEnd: string
): Promise<Record<string, unknown> | null> => {
  const periodStartDate = `${periodStart.slice(0, 7)}-01`
  const networkId = await getAnalyticsNetworkId(retailerId)
  const analyticsRetailerId = networkId ?? retailerId

  const monthStartColumn = await queryAnalytics<{ has_column: boolean }>(
    `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'monthly_archive'
          AND column_name = 'month_start'
      ) AS has_column`
  )

  const monthlyQuery = buildOverviewMonthlyQuery(
    monthStartColumn.rows[0]?.has_column ? 'withMonthStart' : 'withMonthYear'
  )
  const monthlyResult = await queryAnalytics(monthlyQuery, [analyticsRetailerId, periodStartDate])

  if (monthlyResult.rows.length > 0) {
    const historyDesc = monthlyResult.rows
    const history = [...historyDesc].reverse()
    const latest = historyDesc[0] as Record<string, unknown>
    const previous = historyDesc[1] as Record<string, unknown> | undefined

    return {
      view_type: 'monthly',
      source: 'report_snapshot_backfill',
      metrics: {
        gmv: toNumber(latest.gmv),
        conversions: toNumber(latest.conversions),
        profit: toNumber(latest.profit),
        roi: toNumber(latest.roi),
        impressions: toNumber(latest.impressions),
        clicks: toNumber(latest.clicks),
        ctr: toNumber(latest.ctr),
        cvr: toNumber(latest.cvr),
        validation_rate: toNumber(latest.validation_rate),
      },
      coverage: {
        percentage: 0,
        products_with_ads: 0,
        total_products: 0,
      },
      history,
      comparisons: {
        gmv_change_pct: percentageChange(toNumber(latest.gmv), previous ? toNumber(previous.gmv) : null),
        conversions_change_pct: percentageChange(
          toNumber(latest.conversions),
          previous ? toNumber(previous.conversions) : null
        ),
        roi_change_pct: percentageChange(toNumber(latest.roi), previous ? toNumber(previous.roi) : null),
      },
      last_updated: periodEnd,
    }
  }

  const fallback = await query(
    `SELECT range_start AS period_start,
            total_impressions AS impressions,
            total_clicks AS clicks,
            total_conversions AS conversions,
            overall_ctr AS ctr,
            overall_cvr AS cvr,
            last_updated
     FROM keywords_snapshots
     WHERE retailer_id = $1
       AND range_type = 'month'
       AND range_start <= $2::date
     ORDER BY range_start DESC
     LIMIT 13`,
    [retailerId, periodStartDate]
  )

  if (fallback.rows.length === 0) {
    return null
  }

  const historyDesc = fallback.rows
  const latest = historyDesc[0] as Record<string, unknown>
  const previous = historyDesc[1] as Record<string, unknown> | undefined

  return {
    view_type: 'monthly',
    source: 'report_snapshot_backfill',
    metrics: {
      gmv: 0,
      conversions: toNumber(latest.conversions),
      profit: 0,
      roi: 0,
      impressions: toNumber(latest.impressions),
      clicks: toNumber(latest.clicks),
      ctr: toNumber(latest.ctr),
      cvr: toNumber(latest.cvr),
      validation_rate: 0,
    },
    coverage: {
      percentage: 0,
      products_with_ads: 0,
      total_products: 0,
    },
    history: [...historyDesc].reverse().map((row: Record<string, unknown>) => ({
      period_start: row.period_start,
      gmv: 0,
      conversions: toNumber(row.conversions),
      profit: 0,
      roi: 0,
      impressions: toNumber(row.impressions),
      clicks: toNumber(row.clicks),
      ctr: toNumber(row.ctr),
      cvr: toNumber(row.cvr),
    })),
    comparisons: {
      gmv_change_pct: null,
      conversions_change_pct: percentageChange(
        toNumber(latest.conversions),
        previous ? toNumber(previous.conversions) : null
      ),
      roi_change_pct: null,
    },
    last_updated: String(latest.last_updated ?? periodEnd),
  }
}

const main = async () => {
  const options = parseArgs()

  console.log('Backfill report overview snapshots')
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'WRITE'}`)
  if (options.reportId) console.log(`Filter report: ${options.reportId}`)
  if (options.retailerId) console.log(`Filter retailer: ${options.retailerId}`)
  if (options.limit) console.log(`Limit: ${options.limit}`)

  const where: string[] = [
    `rd.domain = 'overview'`,
    `(rd.performance_table IS NULL OR rd.performance_table = '{}'::jsonb)`,
  ]
  const params: Array<number | string> = []

  if (options.reportId) {
    params.push(options.reportId)
    where.push(`rd.report_id = $${params.length}`)
  }

  if (options.retailerId) {
    params.push(options.retailerId)
    where.push(`r.retailer_id = $${params.length}`)
  }

  const limitClause = options.limit ? `LIMIT ${options.limit}` : ''
  const candidates = await query<Candidate>(
    `SELECT rd.report_id, r.retailer_id, r.period_start::text, r.period_end::text
     FROM report_domains rd
     JOIN reports r ON r.id = rd.report_id
     WHERE ${where.join(' AND ')}
     ORDER BY rd.report_id DESC
     ${limitClause}`,
    params
  )

  console.log(`Found ${candidates.rows.length} report(s) missing frozen overview`)

  let updated = 0
  let skipped = 0

  for (const row of candidates.rows) {
    const snapshot = await buildFrozenOverview(row.retailer_id, row.period_start, row.period_end)
    if (!snapshot) {
      skipped += 1
      console.log(`- report ${row.report_id} (${row.retailer_id}): skipped (no source data)`)
      continue
    }

    if (!options.dryRun) {
      await query(
        `UPDATE report_domains
         SET performance_table = $1::jsonb
         WHERE report_id = $2
           AND domain = 'overview'`,
        [JSON.stringify(snapshot), row.report_id]
      )
    }

    updated += 1
    console.log(`- report ${row.report_id} (${row.retailer_id}): ${options.dryRun ? 'would update' : 'updated'}`)
  }

  console.log(`Done. ${options.dryRun ? 'Would update' : 'Updated'}: ${updated}, skipped: ${skipped}`)
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await closePool()
    } catch {
      // Ignore close errors during script shutdown.
    }
  })
