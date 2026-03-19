'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChartSpline, ListFilterPlus } from 'lucide-react'
import { COLORS } from '@/lib/colors'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import MetricToggleGroup from '@/components/client/charts/MetricToggleGroup'
import CohortBandTrendChart from '@/components/client/charts/CohortBandTrendChart'
import HiddenForRetailerBadge from '@/components/client/HiddenForRetailerBadge'

type DomainMatchMode = 'all' | 'any'
type DomainMatchModes = Record<string, DomainMatchMode>
type AuctionDistributionMetric = 'overlap_rate' | 'outranking_share' | 'impression_share'

type CohortDomain = {
  key: string
  label: string
  options: Array<{ value: string; count: number }>
}

type CohortMetadataResponse = {
  domains: CohortDomain[]
  default_filters: Record<string, string[]>
  default_include_provisional: boolean
}

type AuctionCohortResponse = {
  cohort_summary: {
    matched_count: number
  }
  series: {
    cohort_median: Array<{ period_start: string; value: number | null }>
    cohort_p25: Array<{ period_start: string; value: number | null }>
    cohort_p75: Array<{ period_start: string; value: number | null }>
  }
  retailer_series: Array<{ period_start: string; value: number | null }>
}

type DistributionTrendPoint = {
  periodKey: string
  label: string
  retailer: number | null
  cohortMedian: number | null
  cohortP25: number | null
  cohortP75: number | null
}

type DistributionAggregate = {
  retailer: number | null
  cohortMedian: number | null
  cohortP25: number | null
  cohortP75: number | null
}

const METRIC_OPTIONS: Array<{ key: AuctionDistributionMetric; label: string }> = [
  { key: 'overlap_rate', label: 'Overlap' },
  { key: 'outranking_share', label: 'Outrank' },
  { key: 'impression_share', label: 'Impression share' },
]

const STYLE_G_ROW_CONFIG: Array<{ domainKey: string; rowLabel: string }> = [
  { domainKey: 'retailer_format', rowLabel: 'Format' },
  { domainKey: 'primary_category', rowLabel: 'Category' },
  { domainKey: 'target_audience', rowLabel: 'Audience' },
  { domainKey: 'price_positioning', rowLabel: 'Price tier' },
  { domainKey: 'business_model', rowLabel: 'Brand position' },
]

const DOMAIN_FORCED_ANY_KEYS = new Set(['retailer_format', 'price_positioning', 'business_model'])

const getSelectionPillClasses = (allocated: boolean, tone: 'strip' | 'menu' = 'strip'): string => {
  if (allocated) {
    return tone === 'menu'
      ? 'bg-amber-50 text-amber-800'
      : 'border border-amber-300 bg-amber-50 text-amber-900'
  }

  return tone === 'menu' ? 'bg-slate-50 text-slate-700' : 'border border-slate-300 bg-white text-slate-700'
}

const getEffectiveDomainMatchMode = (
  domainKey: string,
  selectedValueCount: number,
  domainMatchModes: DomainMatchModes
): DomainMatchMode => {
  if (DOMAIN_FORCED_ANY_KEYS.has(domainKey)) return 'any'
  if (selectedValueCount <= 1) return 'any'
  return domainMatchModes[domainKey] === 'all' ? 'all' : 'any'
}

const toggleFilterValue = (
  filters: Record<string, string[]>,
  domainKey: string,
  value: string
): Record<string, string[]> => {
  const existing = new Set(filters[domainKey] ?? [])
  if (existing.has(value)) {
    existing.delete(value)
  } else {
    existing.add(value)
  }

  const next = {
    ...filters,
    [domainKey]: Array.from(existing),
  }

  if (next[domainKey].length === 0) {
    delete next[domainKey]
  }

  return next
}

const toUtcDate = (value: string): Date => {
  const dateOnly = value.slice(0, 10)
  return new Date(`${dateOnly}T00:00:00Z`)
}

const formatMonthLabel = (periodStart: string, includeYear = true): string =>
  new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })

const buildMonthlyWindow = (anchorPeriod: string, count: number): string[] => {
  const anchor = `${anchorPeriod.slice(0, 7)}-01`
  const cursor = toUtcDate(anchor)
  const periods: string[] = []

  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(cursor)
    d.setUTCMonth(cursor.getUTCMonth() - i)
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    periods.push(`${year}-${month}-01`)
  }

  return periods
}

const formatPercent = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return 'No data'
  return `${value.toFixed(1)}%`
}

interface AuctionDistributionStripsProps {
  retailerId: string
}

export default function AuctionDistributionStrips({ retailerId }: AuctionDistributionStripsProps) {
  const { period, windowSize } = useDateRange()
  const [domains, setDomains] = useState<CohortDomain[]>([])
  const [retailerAllocatedByDomain, setRetailerAllocatedByDomain] = useState<Record<string, string[]>>({})
  const [benchmarkDomainSelections, setBenchmarkDomainSelections] = useState<Record<string, string[]>>({})
  const [benchmarkDomainMatchModes, setBenchmarkDomainMatchModes] = useState<DomainMatchModes>({})
  const [includeProvisional, setIncludeProvisional] = useState(true)
  const [metric, setMetric] = useState<AuctionDistributionMetric>('overlap_rate')
  const [distributionRowAggregates, setDistributionRowAggregates] = useState<Record<string, DistributionAggregate>>({})
  const [distributionRowTrends, setDistributionRowTrends] = useState<Record<string, DistributionTrendPoint[]>>({})
  const [distributionMenusOpen, setDistributionMenusOpen] = useState<Record<string, boolean>>({})
  const [distributionTrendsOpen, setDistributionTrendsOpen] = useState<Record<string, boolean>>({})
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [distributionError, setDistributionError] = useState<string | null>(null)
  const [metadataLoading, setMetadataLoading] = useState(true)

  const metadataEndpoint = `/api/retailers/${retailerId}/overview/market-comparison`
  const endpoint = `/api/retailers/${retailerId}/auctions/market-comparison`

  const selectedPeriods = useMemo(() => buildMonthlyWindow(period, windowSize), [period, windowSize])
  const currentPeriodStart = `${period.slice(0, 7)}-01`

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setMetadataLoading(true)
        setDistributionError(null)

        const response = await fetch(metadataEndpoint, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Unable to load cohort options')
        }

        const payload = (await response.json()) as CohortMetadataResponse
        const nextDomains = payload.domains ?? []
        const defaultFilters = payload.default_filters ?? {}
        setDomains(nextDomains)
        setRetailerAllocatedByDomain(defaultFilters)
        setBenchmarkDomainSelections(defaultFilters)
        setBenchmarkDomainMatchModes(
          Object.fromEntries(
            nextDomains.map((domain) => [
              domain.key,
              getEffectiveDomainMatchMode(domain.key, (defaultFilters[domain.key] ?? []).length, {}),
            ])
          )
        )
        setIncludeProvisional(payload.default_include_provisional !== false)
      } catch (metadataError) {
        setDistributionError(metadataError instanceof Error ? metadataError.message : 'Unable to load cohort options')
      } finally {
        setMetadataLoading(false)
      }
    }

    loadMetadata()
  }, [metadataEndpoint])

  const distributionRows = useMemo(() => {
    const domainOptionsByKey = new Map(domains.map((domain) => [domain.key, domain.options]))

    return STYLE_G_ROW_CONFIG.map((row) => {
      const selectedValues = benchmarkDomainSelections[row.domainKey] ?? []
      return {
        rowKey: row.domainKey,
        domainKey: row.domainKey,
        rowLabel: row.rowLabel,
        selectedValues,
        domainMatchMode: getEffectiveDomainMatchMode(row.domainKey, selectedValues.length, benchmarkDomainMatchModes),
        options: domainOptionsByKey.get(row.domainKey) ?? [],
        aggregate: distributionRowAggregates[row.domainKey] ?? null,
      }
    })
  }, [benchmarkDomainMatchModes, benchmarkDomainSelections, distributionRowAggregates, domains])

  useEffect(() => {
    if (metadataLoading) {
      setDistributionRowAggregates({})
      setDistributionRowTrends({})
      return
    }

    const rowSpecs = STYLE_G_ROW_CONFIG
      .map((row) => ({
        domainKey: row.domainKey,
        selectedValues: benchmarkDomainSelections[row.domainKey] ?? [],
        rowKey: row.domainKey,
      }))
      .filter((row) => row.selectedValues.length > 0)

    if (rowSpecs.length === 0) {
      setDistributionRowAggregates({})
      setDistributionRowTrends({})
      return
    }

    const run = async () => {
      try {
        setDistributionLoading(true)
        setDistributionError(null)

        const responses = await Promise.all(
          rowSpecs.map(async ({ domainKey, selectedValues, rowKey }) => {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                metric,
                include_provisional: includeProvisional,
                match_mode: 'all',
                domain_match_modes: benchmarkDomainMatchModes,
                period_starts: selectedPeriods,
                filters: { [domainKey]: selectedValues },
              }),
            })

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: string } | null
              throw new Error(payload?.error || 'Unable to load auction distribution rows')
            }

            const payload = (await response.json()) as AuctionCohortResponse

            const medianMap = new Map(payload.series.cohort_median.map((point) => [point.period_start.slice(0, 10), point.value]))
            const p25Map = new Map(payload.series.cohort_p25.map((point) => [point.period_start.slice(0, 10), point.value]))
            const p75Map = new Map(payload.series.cohort_p75.map((point) => [point.period_start.slice(0, 10), point.value]))
            const retailerMap = new Map(payload.retailer_series.map((point) => [point.period_start.slice(0, 10), point.value]))

            return {
              rowKey,
              aggregate: {
                retailer: retailerMap.get(currentPeriodStart) ?? null,
                cohortMedian: medianMap.get(currentPeriodStart) ?? null,
                cohortP25: p25Map.get(currentPeriodStart) ?? null,
                cohortP75: p75Map.get(currentPeriodStart) ?? null,
              } satisfies DistributionAggregate,
              trends: selectedPeriods.map((periodStart, index) => {
                const parsed = toUtcDate(periodStart)
                const includeYear = index === 0 || parsed.getUTCMonth() === 0
                return {
                  periodKey: periodStart,
                  label: formatMonthLabel(periodStart, includeYear),
                  retailer: retailerMap.get(periodStart) ?? null,
                  cohortMedian: medianMap.get(periodStart) ?? null,
                  cohortP25: p25Map.get(periodStart) ?? null,
                  cohortP75: p75Map.get(periodStart) ?? null,
                }
              }),
            }
          })
        )

        const nextAggregates: Record<string, DistributionAggregate> = {}
        const nextTrends: Record<string, DistributionTrendPoint[]> = {}
        for (const item of responses) {
          nextAggregates[item.rowKey] = item.aggregate
          nextTrends[item.rowKey] = item.trends
        }

        setDistributionRowAggregates(nextAggregates)
        setDistributionRowTrends(nextTrends)
      } catch (requestError) {
        setDistributionError(requestError instanceof Error ? requestError.message : 'Unable to load auction distribution rows')
      } finally {
        setDistributionLoading(false)
      }
    }

    run()
  }, [benchmarkDomainSelections, benchmarkDomainMatchModes, currentPeriodStart, endpoint, includeProvisional, metadataLoading, metric, selectedPeriods])

  const distributionDeltaMax = useMemo(() => {
    const deltas = distributionRows
      .flatMap((row) => {
        const median = row.aggregate?.cohortMedian
        if (median == null) return []
        return [row.aggregate?.cohortP25, row.aggregate?.cohortP75, row.aggregate?.retailer]
          .filter((value): value is number => value !== null)
          .map((value) => Math.abs(value - median))
      })
      .filter((value) => Number.isFinite(value))

    if (deltas.length === 0) return 1
    const maxDelta = Math.max(...deltas)
    return maxDelta === 0 ? 1 : maxDelta
  }, [distributionRows])

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-4">
      <HiddenForRetailerBadge label={"In development \u2014 will not appear in Snapshot Reports"} />

      <div className="flex flex-wrap items-center gap-4">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          How your auction insights compare to similar advertisers ({formatMonthLabel(currentPeriodStart, true)})
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Metric</label>
          <MetricToggleGroup options={METRIC_OPTIONS} selected={metric} onSelect={setMetric} />
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-2">
        {distributionRows.map((row, rowIndex) => {
          const medianValue = row.aggregate?.cohortMedian ?? null
          const toRelativePos = (value: number | null): number | null => {
            if (value === null || medianValue === null) return null
            const relative = ((value - medianValue) / distributionDeltaMax) * 46
            return Math.max(2, Math.min(98, 50 + relative))
          }

          const p25 = toRelativePos(row.aggregate?.cohortP25 ?? null)
          const p75 = toRelativePos(row.aggregate?.cohortP75 ?? null)
          const median = 50
          const you = toRelativePos(row.aggregate?.retailer ?? null)

          return (
            <div
              key={`auction-distribution-row-${row.rowKey}`}
              className={`space-y-2 pb-2 ${rowIndex < distributionRows.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0 space-y-1">
                  <div className="grid grid-cols-[196px_auto_auto] items-center gap-2">
                    <div className="text-base font-semibold text-slate-800 text-right">{row.rowLabel}</div>
                    <div />
                    <div />
                  </div>
                  <div className="grid grid-cols-[196px_auto_auto] items-start gap-2">
                    <div className="w-[196px] shrink-0 min-h-7 px-0 py-0 text-sm text-slate-700">
                      {row.selectedValues.length > 0 ? (
                        <div className="flex min-h-7 w-full flex-wrap content-start justify-end gap-1">
                          {row.selectedValues.map((value) => {
                            const allocated = (retailerAllocatedByDomain[row.domainKey] ?? []).includes(value)
                            return (
                              <span
                                key={`auction-selected-pill-${row.rowKey}-${value}`}
                                className={`inline-flex max-w-[180px] items-center justify-center truncate text-center rounded-md px-3 py-0.5 text-xs ${getSelectionPillClasses(allocated, 'strip')}`}
                                title={value}
                              >
                                {value}
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-right">All advertisers</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDistributionMenusOpen((current) => ({
                        ...current,
                        [row.rowKey]: !current[row.rowKey],
                      }))}
                      className="inline-flex h-7 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <ListFilterPlus className="mx-auto h-4 w-4" />
                      <span className="hidden lg:inline">Filters</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDistributionTrendsOpen((current) => ({
                        ...current,
                        [row.rowKey]: !current[row.rowKey],
                      }))}
                      className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-xs leading-none transition-colors ${distributionTrendsOpen[row.rowKey]
                        ? 'border-amber-300 bg-amber-100 text-amber-900'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <ChartSpline className="mx-auto h-4 w-4" />
                      <span className="hidden lg:inline">Trend</span>
                    </button>
                  </div>
                  {distributionMenusOpen[row.rowKey] && (
                    <div className="relative">
                      <div className="absolute left-0 z-10 mt-1 max-h-56 w-72 overflow-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                        {!DOMAIN_FORCED_ANY_KEYS.has(row.domainKey) && (
                          <div className="mb-2 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                            <span className="text-[11px] font-medium text-gray-500">When multiple values are selected</span>
                            <select
                              value={row.domainMatchMode}
                              disabled={row.selectedValues.length <= 1}
                              onChange={(event) => {
                                const nextMode = event.target.value as DomainMatchMode
                                setBenchmarkDomainMatchModes((current) => ({
                                  ...current,
                                  [row.domainKey]: nextMode,
                                }))
                              }}
                              className="rounded border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <option value="any">Match any selected value (OR)</option>
                              <option value="all">Match all selected values (AND)</option>
                            </select>
                          </div>
                        )}
                        <div className="space-y-1">
                          {row.options.length === 0 ? (
                            <p className="text-sm text-gray-500">No values yet</p>
                          ) : (
                            row.options.map((option) => {
                              const selected = row.selectedValues.includes(option.value)
                              const allocated = (retailerAllocatedByDomain[row.domainKey] ?? []).includes(option.value)
                              return (
                                <label
                                  key={`auction-row-option-${row.domainKey}-${option.value}`}
                                  className={`flex items-center justify-between gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50 ${allocated ? 'bg-amber-50' : ''}`}
                                >
                                  <span className="inline-flex items-center gap-2 text-gray-700">
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => setBenchmarkDomainSelections((current) => toggleFilterValue(current, row.domainKey, option.value))}
                                    />
                                    {selected || allocated ? (
                                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${getSelectionPillClasses(allocated, 'menu')}`}>
                                        {option.value}{allocated ? ' (You)' : ''}
                                      </span>
                                    ) : (
                                      <span>{option.value}</span>
                                    )}
                                  </span>
                                </label>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {row.aggregate?.cohortMedian === null && row.aggregate?.cohortP25 === null && row.aggregate?.cohortP75 === null ? (
                  <div className="relative h-[60px] flex-1 flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-4 text-xs text-slate-600">
                    No matching advertisers currently available.
                  </div>
                ) : (
                  <div className="relative h-[60px] flex-1">
                    <div className="absolute inset-y-0 w-px bg-slate-100" style={{ left: '50%' }} />
                    {p25 !== null && p75 !== null && (
                      <div
                        className="absolute top-1/2 h-2 -translate-y-1/2 rounded bg-slate-300"
                        style={{ left: `${Math.min(p25, p75)}%`, width: `${Math.max(2, Math.abs(p75 - p25))}%` }}
                      />
                    )}
                    {p25 !== null && (
                      <div
                        className="absolute top-1/2 h-6 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded bg-slate-500"
                        style={{ left: `${p25}%` }}
                        title={`25th percentile: ${formatPercent(row.aggregate?.cohortP25 ?? null)}`}
                      />
                    )}
                    {p75 !== null && (
                      <div
                        className="absolute top-1/2 h-6 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded bg-slate-500"
                        style={{ left: `${p75}%` }}
                        title={`75th percentile: ${formatPercent(row.aggregate?.cohortP75 ?? null)}`}
                      />
                    )}
                    <div
                      className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded"
                      style={{ left: `${median}%`, backgroundColor: COLORS.success }}
                      title={`Median: ${formatPercent(row.aggregate?.cohortMedian ?? null)}`}
                    >
                      <span className="absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.success }}>
                        {rowIndex === 0
                          ? `Median ${formatPercent(row.aggregate?.cohortMedian ?? null)}`
                          : formatPercent(row.aggregate?.cohortMedian ?? null)}
                      </span>
                    </div>
                    {you !== null && (
                      <div
                        className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded"
                        style={{ left: `${you}%`, backgroundColor: COLORS.warning }}
                        title={`You: ${formatPercent(row.aggregate?.retailer ?? null)}`}
                      >
                        <span className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.warningDark }}>
                          {rowIndex === 0
                            ? `You ${formatPercent(row.aggregate?.retailer ?? null)}`
                            : formatPercent(row.aggregate?.retailer ?? null)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {distributionTrendsOpen[row.rowKey] && (
                <div className="ml-56 pl-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-medium text-slate-600">
                      {row.rowLabel} cohort trend for {METRIC_OPTIONS.find((option) => option.key === metric)?.label}
                    </p>
                    <CohortBandTrendChart
                      data={distributionRowTrends[row.rowKey] ?? []}
                      valueFormatter={formatPercent}
                      yTickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {distributionLoading && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Refreshing auction distribution rows...
        </div>
      )}
      {distributionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{distributionError}</div>
      )}
      {!distributionLoading && distributionRows.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Select at least one value within the chosen domains to render rows.
        </div>
      )}
    </div>
  )
}
