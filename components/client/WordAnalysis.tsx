'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Info, Star, Target, TrendingDown, XCircle } from 'lucide-react'
import { fetchWordAnalysis, type WordAnalysisResponse } from '@/lib/api-client'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import { PerformanceTable, QuickStatsBar } from '@/components/shared'
import HiddenForRetailerBadge from '@/components/client/HiddenForRetailerBadge'

interface WordAnalysisProps {
  retailerId: string
  apiBase?: string
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
}

type ViewMode = 'all' | 'star' | 'good' | 'average' | 'dead' | 'poor'

type WordAnalysisRow = WordAnalysisResponse['words'][number] & {
  ctr: number
  cvr: number
  efficiency: number
}

const TIER_STYLES: Record<string, {
  label: string
  bgColor: string
  textColor: string
  borderColor: string
  Icon: typeof Star
}> = {
  star: {
    label: 'Star',
    Icon: Star,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  good: {
    label: 'Good',
    Icon: CheckCircle,
    bgColor: 'bg-teal-50',
    textColor: 'text-teal-700',
    borderColor: 'border-teal-200',
  },
  average: {
    label: 'Average',
    Icon: Info,
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
  },
  poor: {
    label: 'Poor',
    Icon: TrendingDown,
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
  },
  dead: {
    label: 'Wasted',
    Icon: XCircle,
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
}

export default function WordAnalysis({ retailerId, apiBase, reportId, reportPeriod }: WordAnalysisProps) {
  const { period, start, end } = useDateRange()
  const [words, setWords] = useState<WordAnalysisResponse['words']>([])
  const [summary, setSummary] = useState<WordAnalysisResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('all')

  const formatNumber = (num: number | null | undefined, options?: Intl.NumberFormatOptions): string => {
    if (num == null) return '0'
    return num.toLocaleString('en-GB', options)
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const result = await fetchWordAnalysis(retailerId, {
          apiBase,
          period: reportId ? undefined : period,
          start: reportId ? reportPeriod?.start : start,
          end: reportId ? reportPeriod?.end : end,
          sortBy: 'conversions',
          tier: 'all',
          limit: 10000,
          minFrequency: 3,
        })

        setWords(result.words || [])
        setSummary(result.summary || null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        console.error('Error fetching word analysis:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [apiBase, end, period, reportId, reportPeriod?.end, reportPeriod?.start, retailerId, start])

  const tableData = useMemo<WordAnalysisRow[]>(() => {
    return words.map((word) => ({
      ...word,
      ctr: Number(word.avg_ctr ?? 0),
      cvr: Number(word.avg_cvr ?? 0),
      efficiency: Number(word.click_to_conversion_pct ?? 0),
    }))
  }, [words])

  const filteredWords = useMemo(() => {
    if (viewMode === 'all') return tableData
    return tableData.filter((word) => word.performance_tier === viewMode)
  }, [tableData, viewMode])

  const powerExamples = useMemo(() => {
    return [...tableData]
      .filter((word) => word.performance_tier === 'star' || word.performance_tier === 'good')
      .sort((left, right) => right.total_conversions - left.total_conversions || right.total_clicks - left.total_clicks)
      .slice(0, 5)
  }, [tableData])

  const wastedExamples = useMemo(() => {
    return [...tableData]
      .filter((word) => word.performance_tier === 'dead')
      .sort((left, right) => right.total_clicks - left.total_clicks || right.total_impressions - left.total_impressions)
      .slice(0, 5)
  }, [tableData])

  const formatExampleList = (items: WordAnalysisRow[]) => {
    if (items.length === 0) return 'No examples in this period.'

    return items.map((item) => item.word).join(', ')
  }

  const deadImpressions = useMemo(() => {
    return tableData
      .filter((word) => word.performance_tier === 'dead')
      .reduce((sum, word) => sum + Number(word.total_impressions ?? 0), 0)
  }, [tableData])

  const quickStats = useMemo(() => {
    if (!summary) return []

    const powerWords = (summary.star_words || 0) + (summary.good_words || 0)
    const wastedTermImpressionShare = summary.total_impressions > 0
      ? `${((deadImpressions / summary.total_impressions) * 100).toFixed(1)}%`
      : '0.0%'

    return [
      {
        label: 'Analysed Terms',
        value: String(summary.total_words || 0),
        color: '#111827',
        subtitle: 'Seen in 3+ search terms',
        subtitleColor: '#111827',
        tooltip:
          'Only unique terms that appear in at least 3 distinct search terms are included, to reduce noise from one-off queries.',
      },
      {
        label: 'Power Words',
        value: String(powerWords),
        color: '#111827',
        subtitle: formatExampleList(powerExamples),
        subtitleColor: '#111827',
        tooltip:
          'Power words are single analysed words tagged as star or good because they appear in converting search terms often enough to signal strong purchase intent.',
      },
      {
        label: 'Wasted Terms',
        value: String(summary.dead_words || 0),
        color: '#111827',
        subtitle: formatExampleList(wastedExamples),
        subtitleColor: '#111827',
        tooltip:
          'Wasted terms are analysed words with at least 5 clicked search terms and zero converting search terms in the selected period.',
      },
      {
        label: 'Wasted Terms % of Total Impressions',
        value: wastedTermImpressionShare,
        color: '#111827',
        tooltip:
          'Calculated from dead terms only: impressions from wasted terms divided by total impressions across the analysed term set.',
      },
    ]
  }, [deadImpressions, powerExamples, summary, wastedExamples])

  const renderTierBadge = (tier: string) => {
    const badge = TIER_STYLES[tier] ?? TIER_STYLES.average
    const IconComponent = badge.Icon

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.bgColor} ${badge.textColor} ${badge.borderColor}`}
      >
        <IconComponent className={`h-3 w-3${tier === 'star' ? ' fill-current' : ''}`} />
        {badge.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600">Loading word analysis...</span>
        </div>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
        <div className="flex items-center gap-3 text-amber-600">
          <AlertTriangle size={20} />
          <div>
            <h3 className="font-semibold">Word Analysis Unavailable</h3>
            <p className="text-sm text-gray-600 mt-1">
              {error || 'No word analysis data available. Run the analysis script first.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const filters = [
    {
      key: 'all',
      label: 'All Terms',
      count: summary.total_words,
      tooltip: 'Show all analysed terms with at least 3 distinct search terms.',
    },
    {
      key: 'star',
      label: 'Star',
      count: summary.star_words,
      icon: Star,
      color: '#2563EB',
      tooltip: 'Star terms: strong conversion coverage and high click-to-conversion efficiency.',
    },
    {
      key: 'good',
      label: 'Good',
      count: summary.good_words,
      icon: CheckCircle,
      color: '#14B8A6',
      tooltip: 'Good terms: consistent conversion signals with solid efficiency.',
    },
    {
      key: 'average',
      label: 'Average',
      count: summary.average_words,
      icon: Info,
      color: '#6B7280',
      tooltip: 'Average terms: present often enough to analyse, but without a strong positive or wasted signal.',
    },
    {
      key: 'poor',
      label: 'Poor',
      count: summary.poor_words,
      icon: TrendingDown,
      color: '#F59E0B',
      tooltip: 'Poor terms: clicked terms with weak outcomes but not severe enough to count as wasted.',
    },
    {
      key: 'dead',
      label: 'Wasted Terms',
      count: summary.dead_words,
      icon: XCircle,
      color: '#DC2626',
      tooltip: 'Wasted terms: at least 5 clicked search terms and zero converting search terms.',
    },
  ]

  const tableColumns = [
    {
      key: 'word',
      label: 'Term',
      align: 'left' as const,
      sortable: true,
      render: (row: WordAnalysisRow) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{row.word}</span>
          {viewMode === 'all' ? renderTierBadge(row.performance_tier) : null}
        </div>
      ),
    },
    {
      key: 'total_impressions',
      label: 'Impressions',
      align: 'right' as const,
      sortable: true,
      format: 'number' as const,
    },
    {
      key: 'total_clicks',
      label: 'Clicks',
      align: 'right' as const,
      sortable: true,
      format: 'number' as const,
    },
    {
      key: 'ctr',
      label: 'CTR',
      align: 'right' as const,
      sortable: true,
      format: 'percent' as const,
    },
    {
      key: 'total_conversions',
      label: 'Conversions',
      align: 'right' as const,
      sortable: true,
      render: (row: WordAnalysisRow) => formatNumber(row.total_conversions, { maximumFractionDigits: 2 }),
    },
    {
      key: 'cvr',
      label: 'CVR',
      align: 'right' as const,
      sortable: true,
      format: 'percent' as const,
    },
    {
      key: 'efficiency',
      label: 'Efficiency',
      align: 'right' as const,
      sortable: true,
      format: 'percent' as const,
      tooltip: 'Efficiency is the share of clicked search terms containing this word that also converted.',
    },
  ]

  return (
    <div className="space-y-5">
      {!reportId && (
        <HiddenForRetailerBadge label="In development — will not appear in Snapshot Reports" />
      )}

      {quickStats.length > 0 && <QuickStatsBar items={quickStats} />}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Target size={24} className="text-blue-600" />
              Word Performance Analysis
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Single-word insights from {formatNumber(summary.total_words)} analysed terms in the selected period.
            </p>
          </div>
        </div>

        <PerformanceTable
          key={viewMode}
          data={filteredWords}
          columns={tableColumns}
          filters={filters}
          defaultFilter={viewMode}
          onFilterChange={(filter) => setViewMode(filter as ViewMode)}
          defaultSort={{ key: 'total_conversions', direction: 'desc' }}
          pageSize={50}
          stickyHeader
        />

        {summary.analysis_date && (
          <p className="mt-4 text-xs text-gray-500">
            Based on source data available up to {new Date(summary.analysis_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
          </p>
        )}
      </div>
    </div>
  )
}
