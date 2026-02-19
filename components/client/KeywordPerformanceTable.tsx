'use client'

import React, { useState } from 'react'
import { Star, TrendingUp, TrendingDown, XCircle, AlertCircle, Minus } from 'lucide-react'
import { PerformanceTable } from '@/components/shared'
import type { KeywordPerformance as KeywordRow } from '@/types'

interface KeywordSummary {
  unique_search_terms: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  terms_with_conversions: number
  terms_with_clicks: number
  overall_ctr: number
  overall_cvr: number
  overall_conversion_rate: number
  tier_star: number
  tier_strong: number
  tier_underperforming: number
  tier_poor: number
}

interface KeywordPerformanceTableProps {
  keywords: KeywordRow[]
  summary: KeywordSummary | null
  loading?: boolean
  error?: string | null
}

export default function KeywordPerformanceTable({
  keywords,
  summary,
  loading = false,
  error = null,
}: KeywordPerformanceTableProps) {
  const [sortMetric, setSortMetric] = useState<'conversions' | 'clicks' | 'impressions'>('conversions')

  const formatNumber = (num: number | null | undefined): string => {
    if (num == null) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toLocaleString()
  }

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'star':
        return {
          Icon: Star,
          label: 'STAR',
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
        }
      case 'strong':
        return {
          Icon: TrendingUp,
          label: 'STRONG',
          bgColor: 'bg-teal-50',
          textColor: 'text-teal-700',
          borderColor: 'border-teal-200',
        }
      case 'underperforming':
      case 'moderate':
        return {
          Icon: TrendingDown,
          label: 'UNDERPERFORMING',
          bgColor: 'bg-amber-50',
          textColor: 'text-amber-700',
          borderColor: 'border-amber-200',
        }
      case 'poor':
      case 'critical':
        return {
          Icon: XCircle,
          label: 'POOR',
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
        }
      default:
        return {
          Icon: Minus,
          label: 'UNKNOWN',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-200',
        }
    }
  }

  const handleSortChange = (key: string) => {
    if (key === 'conversions' || key === 'clicks' || key === 'impressions') {
      setSortMetric(key as 'conversions' | 'clicks' | 'impressions')
    }
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 text-amber-600">
          <AlertCircle size={20} />
          <div>
            <h3 className="font-semibold">Keyword Data Unavailable</h3>
            <p className="text-sm text-gray-600 mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600 mt-3">Loading search terms...</span>
          <p className="text-sm text-gray-500 mt-2 text-center max-w-md">
            This may take a few moments for large datasets.
          </p>
        </div>
      </div>
    )
  }

  if (!keywords || keywords.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <p className="text-center text-gray-500">No search term data available for this period.</p>
      </div>
    )
  }

  return (
    <PerformanceTable
      data={keywords.map((kw, idx) => ({
        rank: idx + 1,
        search_term: kw.search_term,
        performance_tier: kw.performance_tier,
        impressions: kw.total_impressions,
        clicks: kw.total_clicks,
        ctr: kw.ctr,
        conversions: kw.total_conversions,
        cvr: kw.conversion_rate,
        days_active: kw.days_active,
      }))}
      columns={[
        { key: 'rank', label: '#', align: 'left' },
        {
          key: 'search_term',
          label: 'Search Term',
          align: 'left',
          sortable: true,
        },
        {
          key: 'performance_tier',
          label: 'Performance',
          align: 'center',
          sortable: true,
          render: (row: { performance_tier: string }) => {
            const badge = getTierBadge(row.performance_tier)
            const IconComponent = badge.Icon
            return (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border ${badge.bgColor} ${badge.textColor} ${badge.borderColor}`}
              >
                <IconComponent className="w-3 h-3" />
                {badge.label}
              </span>
            )
          },
        },
        {
          key: 'impressions',
          label: 'Impressions',
          align: 'right',
          format: 'number',
          sortable: true,
        },
        {
          key: 'clicks',
          label: 'Clicks',
          align: 'right',
          format: 'number',
          sortable: true,
        },
        {
          key: 'ctr',
          label: 'CTR',
          align: 'right',
          sortable: true,
          render: (row) => {
            const ctr = (row as KeywordRow).ctr
            return ctr != null ? `${Number(ctr).toFixed(1)}%` : '-'
          },
        },
        {
          key: 'conversions',
          label: 'Conversions',
          align: 'right',
          format: 'number',
          sortable: true,
        },
        {
          key: 'cvr',
          label: 'CVR',
          align: 'right',
          sortable: true,
          render: (row) => {
            const cvr = (row as KeywordRow).cvr
            return cvr != null ? `${Number(cvr).toFixed(1)}%` : '-'
          },
        },
      ]}
      defaultSort={{ key: sortMetric, direction: 'desc' }}
      onSortChange={handleSortChange}
      pageSize={50}
    />
  )
}
