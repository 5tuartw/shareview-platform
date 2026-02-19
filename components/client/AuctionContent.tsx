'use client'

import { useEffect, useState } from 'react'
import { QuickStatsBar, PerformanceTable } from '@/components/shared'
import type { Column } from '@/components/shared'
import { fetchAuctionInsights, fetchAuctionCompetitors, type CompetitorDetail } from '@/lib/api-client'
import type { AuctionInsightsResponse } from '@/types'

interface AuctionContentProps {
  retailerId: string
  visibleMetrics?: string[]
  featuresEnabled?: Record<string, boolean>
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

export default function AuctionContent({ retailerId, visibleMetrics, featuresEnabled }: AuctionContentProps) {
  const [data, setData] = useState<AuctionInsightsResponse | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState(30)

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [insightsData, competitorsData] = await Promise.all([
          fetchAuctionInsights(retailerId, dateRange),
          fetchAuctionCompetitors(retailerId, dateRange),
        ])
        setData(insightsData)
        setCompetitors(competitorsData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load auction insights')
        console.error('Error loading auction insights:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [retailerId, dateRange])

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

  if (!data) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">No auction insights data available</p>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Date Range:</span>
        <div className="inline-flex rounded-md shadow-sm">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => setDateRange(days)}
              className={`px-4 py-2 text-sm font-medium ${
                dateRange === days
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } ${days === 7 ? 'rounded-l-md' : ''} ${days === 90 ? 'rounded-r-md' : ''} border border-gray-300`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      <QuickStatsBar items={quickStats} />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Understanding Auction Metrics</h3>
        <div className="mb-4 p-3 bg-white rounded border border-blue-300">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Note:</span> These metrics show how Shareight&apos;s campaigns on your
            behalf perform against all other advertisers in the same auctions. The &quot;You (represented by
            Shareight)&quot; row shows your impression share. Other entries with your brand name represent campaigns
            run by other CSS providers or Google on your behalf.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-900 mb-1">Impression Share</p>
            <p className="text-gray-700">
              The number of impressions you received divided by the estimated number of impressions you were
              eligible to receive.
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">Overlap Rate</p>
            <p className="text-gray-700">
              How often another advertiser&apos;s ad received an impression in the same auction that your ad also
              received an impression.
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">Outranking Share</p>
            <p className="text-gray-700">
              How often your ad ranked higher in the auction than another advertiser&apos;s ad, or if your ad was
              shown when theirs was not.
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">Biggest Threat</p>
            <p className="text-gray-700">
              Competitor with high overlap who consistently outranks you - indicating where you are losing
              visibility to competition.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Competitors ({competitors.length})</h3>
        <PerformanceTable data={competitorsTableData} columns={competitorsColumns} />
      </div>
    </div>
  )
}
