'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import MetricToggleGroup from '@/components/client/charts/MetricToggleGroup'
import HiddenForRetailerBadge from '@/components/client/HiddenForRetailerBadge'

type AuctionTrendMetric = 'overlap_rate' | 'outranking_share' | 'impression_share'

type CompetitorGroup = 'primary_competitors' | 'niche_emerging' | 'category_leaders'

type CompetitorMeta = {
  name: string
  group: CompetitorGroup
  group_label: string
  selected_by_default: boolean
}

type TrendPoint = {
  period_start: string
  competitor_name: string
  overlap_rate: number | null
  outranking_share: number | null
  impression_share: number | null
}

type TrendsPayload = {
  period_start: string | null
  lookback_months: number
  periods: string[]
  competitors: CompetitorMeta[]
  series: TrendPoint[]
}

type ChartRow = {
  label: string
  periodStart: string
  [competitor: string]: string | number | null
}

const METRIC_OPTIONS: Array<{ key: AuctionTrendMetric; label: string }> = [
  { key: 'overlap_rate', label: 'Overlap %' },
  { key: 'outranking_share', label: 'You outrank %' },
  { key: 'impression_share', label: 'Impression share %' },
]

const GROUP_ORDER: CompetitorGroup[] = ['primary_competitors', 'niche_emerging', 'category_leaders']

const GROUP_LABELS: Record<CompetitorGroup, string> = {
  primary_competitors: 'Primary competitors',
  niche_emerging: 'Niche / emerging',
  category_leaders: 'Category leaders',
}

const LINE_PALETTE = ['#2563EB', '#0D9488', '#F59E0B', '#DC2626', '#7C3AED', '#0284C7', '#4F46E5', '#059669', '#EA580C']

const formatMonth = (periodStart: string, includeYear = false): string =>
  new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })

interface AuctionCompetitorTrendGraphProps {
  retailerId: string
  period: string
}

export default function AuctionCompetitorTrendGraph({ retailerId, period }: AuctionCompetitorTrendGraphProps) {
  const { windowSize } = useDateRange()
  const [metric, setMetric] = useState<AuctionTrendMetric>('overlap_rate')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<TrendsPayload | null>(null)
  const [selectedCompetitors, setSelectedCompetitors] = useState<Set<string>>(new Set())

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams({
          period,
          lookback_months: String(windowSize),
        })

        const response = await fetch(`/api/retailers/${retailerId}/auctions/performance-trends?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? 'Unable to load auction performance trends')
        }

        const nextPayload = (await response.json()) as TrendsPayload
        setPayload(nextPayload)

        const defaults = nextPayload.competitors
          .filter((competitor) => competitor.selected_by_default)
          .map((competitor) => competitor.name)

        setSelectedCompetitors(new Set(defaults))
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load auction performance trends')
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [period, retailerId, windowSize])

  const groupedCompetitors = useMemo(() => {
    const groups: Record<CompetitorGroup, CompetitorMeta[]> = {
      primary_competitors: [],
      niche_emerging: [],
      category_leaders: [],
    }

    for (const competitor of payload?.competitors ?? []) {
      groups[competitor.group].push(competitor)
    }

    for (const group of GROUP_ORDER) {
      groups[group] = groups[group].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))
    }

    return groups
  }, [payload])

  const selectedNames = useMemo(() => Array.from(selectedCompetitors), [selectedCompetitors])

  const chartData = useMemo<ChartRow[]>(() => {
    if (!payload || selectedNames.length === 0) return []

    const metricByPeriodAndCompetitor = new Map<string, number | null>()
    for (const point of payload.series) {
      metricByPeriodAndCompetitor.set(
        `${point.period_start}::${point.competitor_name}`,
        point[metric]
      )
    }

    return payload.periods.map((periodStart, index) => {
      const includeYear = index === 0 || periodStart.slice(5, 7) === '01'
      const row: ChartRow = {
        periodStart,
        label: formatMonth(periodStart, includeYear),
      }

      for (const competitorName of selectedNames) {
        row[competitorName] = metricByPeriodAndCompetitor.get(`${periodStart}::${competitorName}`) ?? null
      }

      return row
    })
  }, [metric, payload, selectedNames])

  const toggleCompetitor = (name: string) => {
    setSelectedCompetitors((current) => {
      const next = new Set(current)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <HiddenForRetailerBadge label={"In development \u2014 will not appear in Snapshot Reports"} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900">Auction metric trends by competitor</h3>
        <MetricToggleGroup options={METRIC_OPTIONS} selected={metric} onSelect={setMetric} />
      </div>

      <p className="text-xs text-slate-600">
        Look-back window: last <span className="font-semibold text-slate-800">{windowSize}</span> months (controlled from the header).
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {GROUP_ORDER.map((group) => (
          <div key={`competitor-group-${group}`} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              {GROUP_LABELS[group]}
            </p>
            <div className="mt-2 space-y-1.5 max-h-44 overflow-auto pr-1">
              {groupedCompetitors[group].length === 0 ? (
                <p className="text-xs text-slate-500">No competitors in this group.</p>
              ) : (
                groupedCompetitors[group].map((competitor) => (
                  <label key={`competitor-check-${group}-${competitor.name}`} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedCompetitors.has(competitor.name)}
                      onChange={() => toggleCompetitor(competitor.name)}
                    />
                    <span>{competitor.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Loading trend graph...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && selectedNames.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Select at least one competitor to draw the trend graph.
        </div>
      )}

      {!loading && !error && selectedNames.length > 0 && chartData.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#9CA3AF"
                tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
              />
              <Tooltip
                formatter={(value) => {
                  if (value == null) return 'No data'
                  const numeric = Number(value)
                  if (Number.isNaN(numeric)) return 'No data'
                  return `${numeric.toFixed(1)}%`
                }}
                contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
              />
              {selectedNames.map((competitorName, index) => (
                <Line
                  key={`trend-line-${competitorName}`}
                  type="monotone"
                  dataKey={competitorName}
                  name={competitorName}
                  stroke={LINE_PALETTE[index % LINE_PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
