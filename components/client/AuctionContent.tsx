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
  const { period } = useDateRange()
  const [data, setData] = useState<AuctionInsightsResponse | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [insightsData, competitorsData] = await Promise.all([
          fetchAuctionInsights(retailerId, period),
          fetchAuctionCompetitors(retailerId, period),
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
      <QuickStatsBar items={quickStats} />

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Competitors ({competitors.length})</h3>
        <PerformanceTable data={competitorsTableData} columns={competitorsColumns} />
      </div>
    </div>
  )
}
