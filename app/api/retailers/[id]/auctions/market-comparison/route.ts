import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import {
  MARKET_PROFILE_DOMAINS,
  sanitiseMarketProfileDomains,
  type MarketProfileDomains,
  type MarketProfileDomainKey,
  type MarketProfileStatus,
} from '@/lib/market-profiles'
import { getMarketComparisonSettings } from '@/lib/market-comparison-settings'

type RetailerProfileRow = {
  retailer_id: string
  retailer_name: string | null
  source_retailer_id: string | null
  profile_status: MarketProfileStatus | null
  profile_domains: MarketProfileDomains | null
}

type MetricKey = 'overlap_rate' | 'outranking_share' | 'impression_share'
type MatchMode = 'all' | 'any'
type DomainMatchMode = 'all' | 'any'

type CohortFilters = Partial<Record<MarketProfileDomainKey, string[]>>
type DomainMatchModes = Partial<Record<MarketProfileDomainKey, DomainMatchMode>>

const ALLOWED_METRICS: MetricKey[] = ['overlap_rate', 'outranking_share', 'impression_share']

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

const matchesFilters = (
  domains: MarketProfileDomains,
  filters: CohortFilters,
  matchMode: MatchMode,
  domainMatchModes: DomainMatchModes
): boolean => {
  const activeFilters = Object.entries(filters).filter(([, selectedValuesRaw]) => (selectedValuesRaw ?? []).length > 0)
  if (activeFilters.length === 0) return true

  let anyDomainMatched = false

  for (const [domainKey, selectedValuesRaw] of activeFilters) {
    const selectedValues = toCleanValueSet(selectedValuesRaw)
    if (selectedValues.size === 0) continue

    const domain = domains[domainKey as MarketProfileDomainKey]
    const candidateValues = new Set((domain?.values ?? []).map((value) => value.trim().toLowerCase()))

    const domainMatchMode: DomainMatchMode = domainMatchModes[domainKey as MarketProfileDomainKey] === 'all' ? 'all' : 'any'
    let hasMatch = domainMatchMode === 'all'

    for (const selected of selectedValues) {
      if (domainMatchMode === 'all' && !candidateValues.has(selected)) {
        hasMatch = false
        break
      }

      if (domainMatchMode === 'any' && candidateValues.has(selected)) {
        hasMatch = true
        break
      }
    }

    if (matchMode === 'all' && !hasMatch) return false
    if (hasMatch) anyDomainMatched = true
  }

  return matchMode === 'all' ? true : anyDomainMatched
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

const normaliseDomainMatchModes = (input: unknown): DomainMatchModes => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const next: DomainMatchModes = {}
  for (const [domainKey, mode] of Object.entries(input as Record<string, unknown>)) {
    if (!MARKET_PROFILE_DOMAINS.some((domain) => domain.key === domainKey)) continue
    next[domainKey as MarketProfileDomainKey] = mode === 'all' ? 'all' : 'any'
  }

  return next
}

const loadRetailerProfiles = async (): Promise<RetailerProfileRow[]> => {
  const result = await query<RetailerProfileRow>(`
    SELECT
      retailer_id,
      retailer_name,
      source_retailer_id,
      COALESCE(profile_status, 'unassigned') AS profile_status,
      COALESCE(profile_domains, '{}'::jsonb) AS profile_domains
    FROM retailers
  `)

  return result.rows
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
      period_starts?: string[]
      include_provisional?: boolean
      filters?: CohortFilters
      match_mode?: MatchMode
      domain_match_modes?: DomainMatchModes
    } | null

    if (!body || !body.metric || !isAllowedMetric(body.metric)) {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 })
    }

    const settings = await getMarketComparisonSettings()
    const includeProvisional = settings.allow_ai_assigned_profile_values
    const matchMode: MatchMode = body.match_mode === 'any' ? 'any' : 'all'
    const periods = normalisePeriods(body.period_starts)

    if (periods.length === 0) {
      return NextResponse.json({ error: 'No period starts provided' }, { status: 400 })
    }

    const filters = (body.filters ?? {}) as CohortFilters
    const domainMatchModes = normaliseDomainMatchModes(body.domain_match_modes)
    const rows = await loadRetailerProfiles()

    const retailerRow = rows.find((row) => row.retailer_id === retailerId)
    if (!retailerRow) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

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
      return matchesFilters(domains, filters, matchMode, domainMatchModes)
    })

    const matchedRetailersByNetworkId = new Map<string, { retailer_id: string; retailer_name: string }>()
    for (const row of matchedRetailers) {
      const networkId = row.source_retailer_id && row.source_retailer_id.trim().length > 0
        ? row.source_retailer_id.trim()
        : row.retailer_id

      if (!matchedRetailersByNetworkId.has(networkId)) {
        matchedRetailersByNetworkId.set(networkId, {
          retailer_id: row.retailer_id,
          retailer_name: row.retailer_name ?? row.retailer_id,
        })
      }
    }

    const confirmedCount = matchedRetailers.filter((row) => row.profile_status === 'confirmed').length
    const provisionalCount = matchedRetailers.filter((row) => row.profile_status === 'pending_confirmation').length

    const networkIds = Array.from(matchedRetailersByNetworkId.keys())

    const emptySeries = periods.map((period_start) => ({ period_start, value: null }))
    const emptyCounts = periods.map((period_start) => ({ period_start, count: 0 }))

    if (networkIds.length === 0) {
      return NextResponse.json({
        cohort_summary: {
          matched_count: 0,
          confirmed_count: 0,
          provisional_count: 0,
          small_sample: true,
          metric_min: null,
          metric_max: null,
        },
        series: {
          cohort_median: emptySeries,
          cohort_p25: emptySeries,
          cohort_p75: emptySeries,
        },
        retailer_series: emptySeries,
        cohort_counts_by_period: emptyCounts,
      })
    }

    const metricSql = body.metric === 'overlap_rate'
      ? 'AVG(CASE WHEN ai.is_self = FALSE THEN ai.overlap_rate END) * 100'
      : body.metric === 'outranking_share'
        ? 'AVG(CASE WHEN ai.is_self = FALSE THEN ai.outranking_share END) * 100'
        : 'AVG(CASE WHEN ai.is_self = TRUE THEN ai.impr_share END) * 100'

    const cohortResult = await query<{
      period_start: string
      network_key: string
      metric_value: number | null
    }>(
      `SELECT
         ai.month::date::text AS period_start,
         COALESCE(NULLIF(TRIM(r.source_retailer_id), ''), ai.retailer_id) AS network_key,
         ${metricSql} AS metric_value
       FROM auction_insights ai
       JOIN retailers r ON r.retailer_id = ai.retailer_id
       WHERE ai.preferred_for_display = TRUE
         AND ai.month = ANY($1::date[])
         AND COALESCE(NULLIF(TRIM(r.source_retailer_id), ''), ai.retailer_id) = ANY($2::text[])
       GROUP BY ai.month::date, COALESCE(NULLIF(TRIM(r.source_retailer_id), ''), ai.retailer_id)`,
      [periods, networkIds],
    )

    const retailerNetworkKey = retailerRow.source_retailer_id && retailerRow.source_retailer_id.trim().length > 0
      ? retailerRow.source_retailer_id.trim()
      : retailerId

    const retailerResult = await query<{
      period_start: string
      metric_value: number | null
    }>(
      `SELECT
         ai.month::date::text AS period_start,
         ${metricSql} AS metric_value
       FROM auction_insights ai
       JOIN retailers r ON r.retailer_id = ai.retailer_id
       WHERE ai.preferred_for_display = TRUE
         AND ai.month = ANY($1::date[])
         AND COALESCE(NULLIF(TRIM(r.source_retailer_id), ''), ai.retailer_id) = $2
       GROUP BY ai.month::date`,
      [periods, retailerNetworkKey],
    )

    const valuesByPeriod = new Map<string, number[]>()
    for (const row of cohortResult.rows) {
      if (row.metric_value == null || Number.isNaN(Number(row.metric_value))) continue
      const key = row.period_start.slice(0, 10)
      const list = valuesByPeriod.get(key) ?? []
      list.push(Number(row.metric_value))
      valuesByPeriod.set(key, list)
    }

    const retailerByPeriod = new Map<string, number>()
    for (const row of retailerResult.rows) {
      if (row.metric_value == null || Number.isNaN(Number(row.metric_value))) continue
      retailerByPeriod.set(row.period_start.slice(0, 10), Number(row.metric_value))
    }

    const cohortMedian = periods.map((period_start) => ({
      period_start,
      value: percentile(valuesByPeriod.get(period_start) ?? [], 0.5),
    }))

    const cohortP25 = periods.map((period_start) => ({
      period_start,
      value: percentile(valuesByPeriod.get(period_start) ?? [], 0.25),
    }))

    const cohortP75 = periods.map((period_start) => ({
      period_start,
      value: percentile(valuesByPeriod.get(period_start) ?? [], 0.75),
    }))

    const retailerSeries = periods.map((period_start) => ({
      period_start,
      value: retailerByPeriod.get(period_start) ?? null,
    }))

    const allCohortValues = Array.from(valuesByPeriod.values()).flat().filter((value) => Number.isFinite(value))

    return NextResponse.json({
      cohort_summary: {
        matched_count: networkIds.length,
        confirmed_count: confirmedCount,
        provisional_count: provisionalCount,
        small_sample: networkIds.length < 8,
        metric_min: allCohortValues.length > 0 ? Math.min(...allCohortValues) : null,
        metric_max: allCohortValues.length > 0 ? Math.max(...allCohortValues) : null,
      },
      series: {
        cohort_median: cohortMedian,
        cohort_p25: cohortP25,
        cohort_p75: cohortP75,
      },
      retailer_series: retailerSeries,
      cohort_counts_by_period: periods.map((period_start) => ({
        period_start,
        count: (valuesByPeriod.get(period_start) ?? []).length,
      })),
    })
  } catch (error) {
    console.error('Auction market comparison error:', error)
    return NextResponse.json({ error: 'Failed to load auction market comparison' }, { status: 500 })
  }
}
