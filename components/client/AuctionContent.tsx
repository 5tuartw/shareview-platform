'use client'

import { useEffect, useState } from 'react'
import { QuickStatsBar, PerformanceTable } from '@/components/shared'
import type { Column } from '@/components/shared'
import { fetchAuctionInsights, fetchAuctionCompetitors, type CompetitorDetail } from '@/lib/api-client'
import type { AuctionInsightsResponse } from '@/types'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import { Crown, Dot, Radar, Sparkles } from 'lucide-react'
import AuctionCompetitorTrendGraph from '@/components/client/AuctionCompetitorTrendGraph'

interface AuctionContentProps {
  retailerId: string
  isDemoRetailer?: boolean
  visibleMetrics?: string[]
  auctionMetricIds?: string[]
  featuresEnabled?: Record<string, unknown>
  /** When true, shows an admin-only notice if multiple CSS accounts exist for the current period */
  isAdmin?: boolean
}

type CompetitorRow = {
  Competitor: string
  Quadrant: string
  _quadrant: 'primary_competitors' | 'niche_emerging' | 'category_leaders' | 'peripheral_players' | 'unclassified'
  'Days Seen': number
  'Avg Overlap %': string
  'You Outrank %': string
  'Their Impr. Share': string
}

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
  const [quadrantFilter, setQuadrantFilter] = useState<'all' | 'primary_competitors' | 'niche_emerging' | 'category_leaders' | 'peripheral_players' | 'unclassified'>('all')

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
    Quadrant: comp.quadrant_label || 'Unclassified',
    _quadrant: comp.quadrant ?? 'unclassified',
    Competitor: comp.name,
    'Days Seen': comp.days_seen,
    'Avg Overlap %': comp.avg_overlap_rate > 0 ? `${comp.avg_overlap_rate.toFixed(1)}%` : '-',
    'You Outrank %': comp.avg_you_outranking > 0 ? `${comp.avg_you_outranking.toFixed(1)}%` : '-',
    'Their Impr. Share': comp.avg_their_impression_share
      ? comp.impression_share_is_estimate
        ? '< 10%'
        : `${comp.avg_their_impression_share.toFixed(1)}%`
      : '-',
  }))

  const filteredCompetitorsTableData = quadrantFilter === 'all'
    ? competitorsTableData
    : competitorsTableData.filter((row) => row._quadrant === quadrantFilter)

  const quadrantFilters = [
    { key: 'all', label: 'All', count: competitorsTableData.length },
    {
      key: 'primary_competitors',
      label: 'Primary competitors',
      count: competitorsTableData.filter((row) => row._quadrant === 'primary_competitors').length,
      icon: Crown,
      color: '#2563EB',
      tooltip: 'High overlap and high impression share',
    },
    {
      key: 'niche_emerging',
      label: 'Niche / emerging',
      count: competitorsTableData.filter((row) => row._quadrant === 'niche_emerging').length,
      icon: Sparkles,
      color: '#14B8A6',
      tooltip: 'High overlap and low impression share',
    },
    {
      key: 'category_leaders',
      label: 'Category leaders',
      count: competitorsTableData.filter((row) => row._quadrant === 'category_leaders').length,
      icon: Radar,
      color: '#F59E0B',
      tooltip: 'Low overlap and high impression share',
    },
    {
      key: 'peripheral_players',
      label: 'Peripheral players',
      count: competitorsTableData.filter((row) => row._quadrant === 'peripheral_players').length,
      icon: Dot,
      color: '#64748B',
      tooltip: 'Low overlap and low impression share',
    },
  ]

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
  }

  const impressionShareColumn: Column<CompetitorRow> = {
    key: 'Their Impr. Share',
    label: 'Their Impr. Share',
    sortable: true,
    align: 'right',
  }

  const competitorsColumns: Column<CompetitorRow>[] = [
    { key: 'Competitor', label: 'Competitor', sortable: true, align: 'left' },
    { key: 'Quadrant', label: 'Quadrant', sortable: true, align: 'left' },
    { key: 'Days Seen', label: 'Days Seen', sortable: true, align: 'right' },
    ...(isAuctionMetricVisible('overlap_rate', 'ctr') ? [avgOverlapColumn] : []),
    ...(isAuctionMetricVisible('outranking_share', 'roi') ? [youOutrankColumn] : []),
    ...(isAuctionMetricVisible('impression_share', 'impressions') ? [impressionShareColumn] : []),
  ]

  const settingsLink = `/dashboard/retailer/${retailerId}?section=settings&sub=auctions`

  return (
    <div className="space-y-6">
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
          data={filteredCompetitorsTableData}
          columns={competitorsColumns}
          filters={quadrantFilters}
          defaultFilter="all"
          onFilterChange={(filter) => setQuadrantFilter(filter as typeof quadrantFilter)}
        />
      </div>

      <AuctionCompetitorTrendGraph retailerId={retailerId} period={period} />
    </div>
  )
}
