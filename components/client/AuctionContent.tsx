'use client'

import { useEffect, useState } from 'react'
import { QuickStatsBar, PerformanceTable } from '@/components/shared'
import type { Column } from '@/components/shared'
import { fetchAuctionInsights, fetchAuctionCompetitors, type CompetitorDetail } from '@/lib/api-client'
import type { AuctionInsightsResponse } from '@/types'
import { useDateRange } from '@/lib/contexts/DateRangeContext'

interface AuctionContentProps {
  retailerId: string
  visibleMetrics?: string[]
  featuresEnabled?: Record<string, boolean>
  /** When true, shows an admin-only notice if multiple CSS accounts exist for the current period */
  isAdmin?: boolean
}

type CompetitorRow = {
  Competitor: string
  'Days Seen': number
  'Avg Overlap %': string
  'You Outrank %': string
  'They Outrank %': string
  'Their Impr. Share': string
  _isShareight: boolean
}

function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month - 1)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export default function AuctionContent({ retailerId, visibleMetrics, featuresEnabled, isAdmin }: AuctionContentProps) {
  const { period, setPeriod } = useDateRange()
  const [data, setData] = useState<AuctionInsightsResponse | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [noData, setNoData] = useState(false)
  const [nearestBefore, setNearestBefore] = useState<string | null>(null)
  const [nearestAfter, setNearestAfter] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      setNoData(false)
      setNearestBefore(null)
      setNearestAfter(null)
      try {
        const [insightsData, competitorsData] = await Promise.all([
          fetchAuctionInsights(retailerId, period),
          fetchAuctionCompetitors(retailerId, period),
        ])
        setData(insightsData)
        setCompetitors(competitorsData)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load auction insights'
        // 404 = no data for this month — show a friendly gate instead of an error
        if (msg.includes('404') || msg.toLowerCase().includes('no auction data')) {
          const typedErr = err as Error & { nearest_before?: string | null; nearest_after?: string | null }
          setNearestBefore(typedErr.nearest_before ?? null)
          setNearestAfter(typedErr.nearest_after ?? null)
          setNoData(true)
        } else {
          setError(msg)
        }
        console.error('Error loading auction insights:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [retailerId, period])

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
          No auction data for {formatPeriod(period)}
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
                ← {formatPeriod(nearestBefore)}
              </button>
            )}
            {nearestAfter && (
              <button
                onClick={() => setPeriod(nearestAfter)}
                className="inline-flex items-center gap-1 rounded-md bg-white border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
              >
                {formatPeriod(nearestAfter)} →
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const quickStats = [
    isMetricVisible('impressions')
      ? {
          label: 'Your Impression Share',
          value: `${data.overview.avg_impression_share.toFixed(1)}%`,
        }
      : null,
    isMetricVisible('impressions')
      ? {
          label: 'Total Competitors',
          value: data.overview.total_competitors.toString(),
        }
      : null,
    isMetricVisible('ctr')
      ? {
          label: 'Avg Overlap Rate',
          value: `${data.overview.avg_overlap_rate.toFixed(1)}%`,
        }
      : null,
    isMetricVisible('roi')
      ? {
          label: 'You Outrank',
          value: `${data.overview.avg_outranking_share.toFixed(1)}%`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  const competitorsTableData = competitors.map((comp) => ({
    Competitor: comp.is_shareight ? 'You (represented by Shareight)' : comp.name,
    'Days Seen': comp.days_seen,
    'Avg Overlap %': comp.avg_overlap_rate > 0 ? `${comp.avg_overlap_rate.toFixed(1)}%` : '-',
    'You Outrank %': comp.avg_you_outranking > 0 ? `${comp.avg_you_outranking.toFixed(1)}%` : '-',
    'They Outrank %': comp.avg_them_outranking > 0 ? `${comp.avg_them_outranking.toFixed(1)}%` : '-',
    'Their Impr. Share': comp.avg_their_impression_share
      ? comp.impression_share_is_estimate
        ? '< 10%'
        : `${comp.avg_their_impression_share.toFixed(1)}%`
      : '-',
    _isShareight: comp.is_shareight,
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
  }

  const theyOutrankColumn: Column<CompetitorRow> = {
    key: 'They Outrank %',
    label: 'They Outrank %',
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
    { key: 'Days Seen', label: 'Days Seen', sortable: true, align: 'right' },
    ...(isMetricVisible('ctr') ? [avgOverlapColumn] : []),
    ...(isMetricVisible('roi') ? [youOutrankColumn] : []),
    ...(isMetricVisible('roi') ? [theyOutrankColumn] : []),
    ...(isMetricVisible('impressions') ? [impressionShareColumn] : []),
  ]

  const settingsLink = `/dashboard/retailer/${retailerId}?section=settings&sub=auctions`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Auction data for{' '}
          <span className="font-medium text-gray-700">{formatPeriod(period)}</span>
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
        <PerformanceTable data={competitorsTableData} columns={competitorsColumns} />
      </div>
    </div>
  )
}
