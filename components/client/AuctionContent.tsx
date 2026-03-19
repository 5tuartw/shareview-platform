'use client'

import { useEffect, useState } from 'react'
import { QuickStatsBar, PerformanceTable } from '@/components/shared'
import type { Column } from '@/components/shared'
import { fetchAuctionInsights, fetchAuctionCompetitors, type CompetitorDetail } from '@/lib/api-client'
import type { AuctionInsightsResponse } from '@/types'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import { Info, XCircle } from 'lucide-react'
import AuctionCompetitorTrendGraph from '@/components/client/AuctionCompetitorTrendGraph'

interface AuctionContentProps {
  retailerId: string
  reportId?: number
  isDemoRetailer?: boolean
  visibleMetrics?: string[]
  auctionMetricIds?: string[]
  featuresEnabled?: Record<string, unknown>
  /** When true, shows an admin-only notice if multiple CSS accounts exist for the current period */
  isAdmin?: boolean
}

type CompetitorRow = {
  Competitor: string
  'Days Seen': number
  'Avg Overlap %': string
  'You Outrank %': number | null
  'Their Impr. Share': string
}

const GLOSSARY_TERMS: Array<{ term: string; definition: string }> = [
  {
    term: 'Days Seen',
    definition:
      'The number of days in the selected month where this competitor appeared in the same auction as you',
  },
  {
    term: 'Avg Overlap %',
    definition: 'The percentage of your auctions where this competitor also appeared',
  },
  {
    term: 'You Outrank %',
    definition:
      'The percentage of shared auctions where your ad appeared in a higher position than theirs',
  },
  {
    term: 'Their Impr. Share',
    definition: "An estimate of this competitor's impression share across Google Shopping",
  },
]

function formatPeriod(period: string, includeYear = true): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month - 1)
  return d.toLocaleDateString('en-GB', {
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

export default function AuctionContent({
  retailerId,
  reportId,
  isDemoRetailer = false,
  visibleMetrics,
  auctionMetricIds,
  featuresEnabled,
  isAdmin,
}: AuctionContentProps) {
  const { period, setPeriod } = useDateRange()
  const [data, setData] = useState<AuctionInsightsResponse | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [noData, setNoData] = useState(false)
  const [nearestBefore, setNearestBefore] = useState<string | null>(null)
  const [nearestAfter, setNearestAfter] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [glossaryOpen, setGlossaryOpen] = useState(true)

  const hasAuctionMetricSelection = Array.isArray(auctionMetricIds) && auctionMetricIds.length > 0
  const auctionMetricFilter = hasAuctionMetricSelection ? new Set(auctionMetricIds) : null
  const metricsEnabled = featuresEnabled?.auctions_metrics_enabled !== false
  const legacyMetricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null

  const isAuctionMetricVisible = (auctionMetricId: string, fallbackGlobalMetric?: string) => {
    if (!metricsEnabled) return false
    if (auctionMetricFilter) return auctionMetricFilter.has(auctionMetricId)
    if (!fallbackGlobalMetric) return true
    return !legacyMetricsFilter || legacyMetricsFilter.includes(fallbackGlobalMetric)
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      setNoData(false)
      setNearestBefore(null)
      setNearestAfter(null)
      try {
        const insightsData = await fetchAuctionInsights(retailerId, period)
        setData(insightsData)

        try {
          const competitorsData = await fetchAuctionCompetitors(retailerId, period)
          setCompetitors(competitorsData)
        } catch (competitorsError) {
          // Keep overview visible even if competitors endpoint is temporarily unavailable.
          console.error('Error loading auction competitors:', competitorsError)
          setCompetitors([])
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load auction insights'
        // 404 = no data for this month - show a friendly gate instead of an error
        if (msg.includes('404') || msg.toLowerCase().includes('no auction data')) {
          const typedErr = err as Error & { nearest_before?: string | null; nearest_after?: string | null }
          const fallbackPeriod = typedErr.nearest_before ?? typedErr.nearest_after ?? null

          // Auto-step to the closest available month when current month has no upload yet.
          if (fallbackPeriod && fallbackPeriod !== period) {
            setPeriod(fallbackPeriod)
            return
          }

          setNearestBefore(typedErr.nearest_before ?? null)
          setNearestAfter(typedErr.nearest_after ?? null)
          setNoData(true)
        } else {
          setError(msg)
          console.error('Error loading auction insights:', err)
        }
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [retailerId, period, setPeriod])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading auction insights...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    )
  }

  if (noData || !data) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
        <p className="text-blue-900 font-medium mb-1">
          No auction data for {formatPeriod(period, !isDemoRetailer)}
        </p>
        <p className="text-blue-700 text-sm">
          Auction Insights data is uploaded monthly. Try selecting a previous month using the
          date selector above.
        </p>
        {(nearestBefore || nearestAfter) && (
          <div className="mt-4 flex items-center justify-center gap-3">
            {nearestBefore && (
              <button
                onClick={() => setPeriod(nearestBefore)}
                className="inline-flex items-center gap-1 rounded-md bg-white border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
              >
                ← {formatPeriod(nearestBefore, !isDemoRetailer)}
              </button>
            )}
            {nearestAfter && (
              <button
                onClick={() => setPeriod(nearestAfter)}
                className="inline-flex items-center gap-1 rounded-md bg-white border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
              >
                {formatPeriod(nearestAfter, !isDemoRetailer)} →
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const quickStats = [
    isAuctionMetricVisible('impression_share', 'impressions')
      ? {
          label: 'Your Impression Share',
          value: `${data.overview.avg_impression_share.toFixed(1)}%`,
        }
      : null,
    isAuctionMetricVisible('competitor_count')
      ? {
          label: 'Total Competitors',
          value: data.overview.total_competitors.toString(),
        }
      : null,
    isAuctionMetricVisible('overlap_rate', 'ctr')
      ? {
          label: 'Avg Overlap Rate',
          value: `${data.overview.avg_overlap_rate.toFixed(1)}%`,
        }
      : null,
    isAuctionMetricVisible('outranking_share', 'roi')
      ? {
          label: 'You Outrank',
          value: `${data.overview.avg_outranking_share.toFixed(1)}%`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  const competitorsTableData = competitors
    .filter((comp) => !comp.is_shareight)
    .map((comp) => ({
    Competitor: comp.name,
    'Days Seen': comp.days_seen,
    'Avg Overlap %': comp.avg_overlap_rate > 0 ? `${comp.avg_overlap_rate.toFixed(1)}%` : '-',
    'You Outrank %': comp.avg_you_outranking > 0 ? Number(comp.avg_you_outranking.toFixed(1)) : null,
    'Their Impr. Share': comp.avg_their_impression_share
      ? comp.impression_share_is_estimate
        ? '< 10%'
        : `${comp.avg_their_impression_share.toFixed(1)}%`
      : '-',
  }))

  const avgOverlapColumn: Column<CompetitorRow> = {
    key: 'Avg Overlap %',
    label: 'Avg Overlap %',
    sortable: true,
    align: 'right',
  }

  const youOutrankColumn: Column<CompetitorRow> = {
    key: 'You Outrank %',
    label: 'You Outrank %',
    sortable: true,
    align: 'right',
    render: (row) => (row['You Outrank %'] == null ? '-' : `${row['You Outrank %'].toFixed(1)}%`),
  }

  const impressionShareColumn: Column<CompetitorRow> = {
    key: 'Their Impr. Share',
    label: 'Their Impr. Share',
    sortable: true,
    align: 'right',
  }

  const competitorsColumns: Column<CompetitorRow>[] = [
    { key: 'Competitor', label: 'Competitor', sortable: true, align: 'left' },
    { key: 'Days Seen', label: 'Days Seen', sortable: true, align: 'right' },
    ...(isAuctionMetricVisible('overlap_rate', 'ctr') ? [avgOverlapColumn] : []),
    ...(isAuctionMetricVisible('outranking_share', 'roi') ? [youOutrankColumn] : []),
    ...(isAuctionMetricVisible('impression_share', 'impressions') ? [impressionShareColumn] : []),
  ]

  const settingsLink = `/dashboard/retailer/${retailerId}?section=settings&sub=auctions`

  return (
    <div className="space-y-6">
      {!reportId && glossaryOpen && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Column definitions</span>
            <button
              type="button"
              onClick={() => setGlossaryOpen(false)}
              className="text-gray-500 transition-colors hover:text-gray-700"
              aria-label="Hide column definitions"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {GLOSSARY_TERMS.map((item) => (
              <div key={item.term} className="contents">
                <div className="text-sm font-medium text-gray-700">
                  {item.term}
                </div>
                <div className="text-sm text-gray-500">
                  {item.definition}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!reportId && !glossaryOpen && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setGlossaryOpen(true)}
            className="text-gray-500 transition-colors hover:text-gray-700"
            aria-label="Show column definitions"
          >
            <Info className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Auction data for{' '}
          <span className="font-medium text-gray-700">{formatPeriod(period, !isDemoRetailer)}</span>
        </span>
      </div>

      {/* Admin-only multi-account notice */}
      {isAdmin && data.multi_account && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Admin notice:</span> This retailer has multiple CSS accounts for this period.{' '}
          <span className="font-medium">{data.multi_account.active_account_name}</span> is currently being shown.{' '}
          <a
            href={settingsLink}
            className="underline hover:text-amber-900 font-medium"
          >
            Change in Settings → Auctions
          </a>
          . This message does not appear on the retailer&apos;s view.
        </div>
      )}

      <QuickStatsBar items={quickStats} />

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Competitors ({competitors.length})</h3>
        <PerformanceTable
          data={competitorsTableData}
          columns={competitorsColumns}
        />
      </div>

      {!reportId && <AuctionCompetitorTrendGraph retailerId={retailerId} period={period} />}
    </div>
  )
}
