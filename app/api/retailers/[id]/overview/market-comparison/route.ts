import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query, queryAnalytics } from '@/lib/db'
import {
  MARKET_PROFILE_DOMAINS,
  sanitiseMarketProfileDomains,
  type MarketProfileDomains,
  type MarketProfileDomainKey,
  type MarketProfileStatus,
} from '@/lib/market-profiles'
import { buildMarketComparisonMonthlyQuery } from '@/lib/overview-monthly-sql'

type RetailerProfileRow = {
  retailer_id: string
  source_retailer_id: string | null
  profile_status: MarketProfileStatus | null
  profile_domains: MarketProfileDomains | null
}

type MetricKey = 'gmv' | 'profit' | 'impressions' | 'clicks' | 'conversions' | 'ctr' | 'cvr' | 'roi'

type CohortFilters = Partial<Record<MarketProfileDomainKey, string[]>>

const ALLOWED_METRICS: MetricKey[] = ['gmv', 'profit', 'impressions', 'clicks', 'conversions', 'ctr', 'cvr', 'roi']

const isAllowedMetric = (value: string): value is MetricKey => ALLOWED_METRICS.includes(value as MetricKey)

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]

  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]

  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

const toCleanValueSet = (values: string[] | undefined): Set<string> => {
  const set = new Set<string>()
  for (const value of values ?? []) {
    const normalised = value.trim().toLowerCase()
    if (normalised) set.add(normalised)
  }
  return set
}

const matchesFilters = (domains: MarketProfileDomains, filters: CohortFilters): boolean => {
  for (const [domainKey, selectedValuesRaw] of Object.entries(filters)) {
    const selectedValues = toCleanValueSet(selectedValuesRaw)
    if (selectedValues.size === 0) continue

    const domain = domains[domainKey as MarketProfileDomainKey]
    const candidateValues = new Set((domain?.values ?? []).map((value) => value.trim().toLowerCase()))

    let hasMatch = false
    for (const selected of selectedValues) {
      if (candidateValues.has(selected)) {
        hasMatch = true
        break
      }
    }

    if (!hasMatch) return false
  }

  return true
}

const getMetricValue = (row: Record<string, unknown>, metric: MetricKey): number => {
  const value = Number(row[metric] ?? 0)
  return Number.isFinite(value) ? value : 0
}

const normalisePeriods = (periods: unknown): string[] => {
  if (!Array.isArray(periods)) return []
  const seen = new Set<string>()
  const normalised: string[] = []
  for (const period of periods) {
    if (typeof period !== 'string') continue
    const trimmed = period.trim().slice(0, 10)
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalised.push(trimmed)
  }
  return normalised
}

const loadRetailerProfiles = async (): Promise<RetailerProfileRow[]> => {
  const result = await query<RetailerProfileRow>(`
    SELECT
      retailer_id,
      source_retailer_id,
      COALESCE(profile_status, 'unassigned') AS profile_status,
      COALESCE(profile_domains, '{}'::jsonb) AS profile_domains
    FROM retailers
  `)

  return result.rows
}

const hasMonthlyArchiveMonthStart = async (): Promise<boolean> => {
  const result = await queryAnalytics<{ has_column: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'monthly_archive'
        AND column_name = 'month_start'
    ) AS has_column
  `)

  return result.rows[0]?.has_column === true
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const rows = await loadRetailerProfiles()
    const retailerRow = rows.find((row) => row.retailer_id === retailerId)

    if (!retailerRow) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

    const eligibleRows = rows.filter((row) => row.profile_status === 'confirmed' || row.profile_status === 'pending_confirmation')

    const optionBuckets = new Map<MarketProfileDomainKey, Map<string, number>>()
    for (const domain of MARKET_PROFILE_DOMAINS) {
      optionBuckets.set(domain.key, new Map<string, number>())
    }

    for (const row of eligibleRows) {
      if (row.retailer_id === retailerId) continue
      const domains = sanitiseMarketProfileDomains(row.profile_domains, 'manual')

      for (const domainDef of MARKET_PROFILE_DOMAINS) {
        const values = domains[domainDef.key]?.values ?? []
        const bucket = optionBuckets.get(domainDef.key)
        if (!bucket) continue

        for (const value of values) {
          bucket.set(value, (bucket.get(value) ?? 0) + 1)
        }
      }
    }

    const currentDomains = sanitiseMarketProfileDomains(retailerRow.profile_domains, 'manual')

    return NextResponse.json({
      domains: MARKET_PROFILE_DOMAINS.map((domain) => ({
        key: domain.key,
        label: domain.label,
        options: Array.from(optionBuckets.get(domain.key)?.entries() ?? [])
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      })),
      default_filters: {
        primary_category: currentDomains.primary_category?.values ?? [],
      },
      default_include_provisional: true,
    })
  } catch (error) {
    console.error('Overview market comparison metadata error:', error)
    return NextResponse.json({ error: 'Failed to load market comparison metadata' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const body = (await request.json().catch(() => null)) as {
      metric?: string
      view_type?: 'weekly' | 'monthly'
      period_starts?: string[]
      include_provisional?: boolean
      filters?: CohortFilters
    } | null

    if (!body || !body.metric || !isAllowedMetric(body.metric)) {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 })
    }

    const viewType = body.view_type === 'monthly' ? 'monthly' : 'weekly'
    const includeProvisional = body.include_provisional !== false
    const periods = normalisePeriods(body.period_starts)

    if (periods.length === 0) {
      return NextResponse.json({ error: 'No period starts provided' }, { status: 400 })
    }

    const filters = (body.filters ?? {}) as CohortFilters
    const rows = await loadRetailerProfiles()

    const eligibleRows = rows.filter((row) => {
      const status = row.profile_status ?? 'unassigned'
      if (includeProvisional) {
        return status === 'confirmed' || status === 'pending_confirmation'
      }
      return status === 'confirmed'
    })

    const matchedRetailers = eligibleRows.filter((row) => {
      if (row.retailer_id === retailerId) return false
      const domains = sanitiseMarketProfileDomains(row.profile_domains, 'manual')
      return matchesFilters(domains, filters)
    })

    const confirmedCount = matchedRetailers.filter((row) => row.profile_status === 'confirmed').length
    const provisionalCount = matchedRetailers.filter((row) => row.profile_status === 'pending_confirmation').length

    const networkIds = matchedRetailers
      .map((row) => (row.source_retailer_id && row.source_retailer_id.trim().length > 0 ? row.source_retailer_id.trim() : row.retailer_id))
      .filter((value, index, arr) => arr.indexOf(value) === index)

    if (networkIds.length === 0) {
      return NextResponse.json({
        cohort_summary: {
          matched_count: 0,
          confirmed_count: 0,
          provisional_count: 0,
          small_sample: true,
        },
        series: {
          cohort_median: periods.map((period_start) => ({ period_start, value: null })),
          cohort_p25: periods.map((period_start) => ({ period_start, value: null })),
          cohort_p75: periods.map((period_start) => ({ period_start, value: null })),
        },
      })
    }

    let rawRows: Record<string, unknown>[] = []

    if (viewType === 'monthly') {
      const hasMonthStart = await hasMonthlyArchiveMonthStart()
      const result = hasMonthStart
        ? await queryAnalytics(
          buildMarketComparisonMonthlyQuery('withMonthStart'),
          [networkIds, periods]
        )
        : await queryAnalytics(
          buildMarketComparisonMonthlyQuery('withMonthYear'),
          [networkIds, periods]
        )

      rawRows = result.rows
    } else {
      const result = await queryAnalytics(
        `SELECT DISTINCT ON (rm.retailer_id, rm.period_start_date)
           rm.retailer_id,
           rm.period_start_date::text AS period_start,
           rm.gmv,
           rm.profit,
           rm.impressions,
           rm.google_clicks AS clicks,
           rm.google_conversions_transaction AS conversions,
           rm.ctr,
           rm.conversion_rate AS cvr,
           rm.roi,
           rm.fetch_datetime
         FROM retailer_metrics rm
         JOIN fetch_runs fr ON rm.fetch_datetime = fr.fetch_datetime
         WHERE rm.retailer_id = ANY($1)
           AND rm.period_start_date = ANY($2::date[])
           AND fr.fetch_type = '13_weeks'
         ORDER BY rm.retailer_id, rm.period_start_date, rm.fetch_datetime DESC
        `,
        [networkIds, periods]
      )

      rawRows = result.rows
    }

    const byPeriod = new Map<string, number[]>()

    for (const row of rawRows) {
      const periodStart = String(row.period_start ?? '').slice(0, 10)
      if (!periodStart) continue
      const value = getMetricValue(row, body.metric)

      if (!byPeriod.has(periodStart)) {
        byPeriod.set(periodStart, [])
      }
      byPeriod.get(periodStart)?.push(value)
    }

    const cohortMedian = periods.map((period_start) => {
      const values = byPeriod.get(period_start) ?? []
      return {
        period_start,
        value: percentile(values, 0.5),
      }
    })

    const cohortP25 = periods.map((period_start) => {
      const values = byPeriod.get(period_start) ?? []
      return {
        period_start,
        value: percentile(values, 0.25),
      }
    })

    const cohortP75 = periods.map((period_start) => {
      const values = byPeriod.get(period_start) ?? []
      return {
        period_start,
        value: percentile(values, 0.75),
      }
    })

    return NextResponse.json({
      cohort_summary: {
        matched_count: matchedRetailers.length,
        confirmed_count: confirmedCount,
        provisional_count: provisionalCount,
        small_sample: matchedRetailers.length < 5,
      },
      series: {
        cohort_median: cohortMedian,
        cohort_p25: cohortP25,
        cohort_p75: cohortP75,
      },
    })
  } catch (error) {
    console.error('Overview market comparison query error:', error)
    return NextResponse.json({ error: 'Failed to load market comparison data' }, { status: 500 })
  }
}
