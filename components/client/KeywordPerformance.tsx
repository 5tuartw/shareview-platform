'use client'

import React, { useEffect, useState } from 'react'
import {
  Search,
  TrendingUp,
  AlertCircle,
  Star,
  TrendingDown,
  Minus,
  XCircle,
  CheckCircle,
  ArrowRight,
} from 'lucide-react'
import WordAnalysis from './WordAnalysis'
import KeywordMarketInsights from './MarketInsights/KeywordMarketInsights'
import { DateRangeSelector, QuickStatsBar, PerformanceTable } from '@/components/shared'
import PageHeadline from '@/components/shared/PageHeadline'
import { fetchKeywordPerformance, type KeywordPerformanceResponse } from '@/lib/api-client'
import type { KeywordPerformance as KeywordRow } from '@/types'

interface KeywordPerformanceProps {
  retailerId: string
  activeSubTab: string
  selectedMonth?: string
  onMonthChange?: (month: string) => void
  keywordFilters?: string[]
}

type PerformanceTier = 'star' | 'strong' | 'underperforming' | 'poor'

interface HeadlineFilterAction {
  tier: string
  metric: string
}

interface Headline {
  status: 'success' | 'warning' | 'critical'
  message: string
  subtitle: string
  filterAction: HeadlineFilterAction
}

export default function KeywordPerformance({
  retailerId,
  activeSubTab,
  selectedMonth: propSelectedMonth,
  onMonthChange,
  keywordFilters,
}: KeywordPerformanceProps) {
  const [keywords, setKeywords] = useState<KeywordRow[]>([])
  const [summary, setSummary] = useState<KeywordPerformanceResponse['summary'] | null>(null)
  const [headlines, setHeadlines] = useState<Headline[]>([])
  const [keywordsLoading, setKeywordsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(propSelectedMonth || '2025-11')
  const [filterTier, setFilterTier] = useState<PerformanceTier | 'all'>('all')
  const [sortMetric, setSortMetric] = useState<'conversions' | 'clicks' | 'impressions'>('conversions')

  const availableMonths = [{ value: '2025-11', label: 'November 2025' }]

  useEffect(() => {
    if (propSelectedMonth && propSelectedMonth !== selectedMonth) {
      setSelectedMonth(propSelectedMonth)
    }
  }, [propSelectedMonth, selectedMonth])

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month)
    if (onMonthChange) {
      onMonthChange(month)
    }
  }

  useEffect(() => {
    const fetchHeadlines = async () => {
      try {
        const result = await fetchKeywordPerformance(retailerId, { period: selectedMonth })
        setHeadlines((result.headlines || []) as Headline[])
      } catch (err) {
        console.error('Error fetching headlines:', err)
      }
    }

    fetchHeadlines()
  }, [retailerId, selectedMonth])

  useEffect(() => {
    if (activeSubTab !== 'keyword-performance') {
      return
    }

    const fetchData = async () => {
      try {
        setKeywordsLoading(true)
        const result = await fetchKeywordPerformance(retailerId, {
          metric: sortMetric,
          period: selectedMonth,
          tier: filterTier,
        })

        const filteredKeywords = result.keywords.filter((kw) => {
          if (!keywordFilters || keywordFilters.length === 0) return true
          return !keywordFilters.some((filter) =>
            kw.search_term.toLowerCase().includes(filter.toLowerCase())
          )
        })

        setKeywords(filteredKeywords)
        setSummary(result.summary || null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        console.error('Error fetching search terms:', err)
      } finally {
        setKeywordsLoading(false)
      }
    }

    fetchData()
  }, [retailerId, selectedMonth, activeSubTab, filterTier, sortMetric, keywordFilters])

  const formatNumber = (num: number | null | undefined): string => {
    if (num == null) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toLocaleString()
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
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

  const getTierBadge = (tier: PerformanceTier | string) => {
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
          Icon: CheckCircle,
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

  const handleHeadlineClick = (filterAction: HeadlineFilterAction) => {
    setFilterTier(filterAction.tier as PerformanceTier | 'all')
    setSortMetric(filterAction.metric as 'conversions' | 'clicks' | 'impressions')

    const performanceSection = document.getElementById('keyword-performance-table')
    if (performanceSection) {
      performanceSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="space-y-6">
      <DateRangeSelector
        selectedMonth={selectedMonth}
        availableMonths={availableMonths}
        onChange={handleMonthChange}
        showQuickSelect={false}
      />

      {activeSubTab === 'summary' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Search size={24} className="text-blue-600" />
              Keyword Summary
            </h2>
            <p className="text-sm text-gray-500 mt-1">Pre-calculated insights for {selectedMonth}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-gray-700">
              <strong>Coming Soon:</strong> This tab will display pre-calculated keyword insights from the
              page_insights table.
            </p>
            <p className="text-sm text-gray-600 mt-2">
              For now, use the &quot;Keyword Performance&quot; tab to view keyword data.
            </p>
          </div>
        </div>
      )}

      {activeSubTab === 'keyword-performance' && (
        <div className="space-y-6">
          {headlines && headlines.length > 0 && (
            <div className="space-y-3">
              {headlines.map((headline, idx) => (
                <PageHeadline
                  key={idx}
                  status={headline.status}
                  message={headline.message}
                  subtitle={headline.subtitle}
                  actionLink={{
                    label: 'View Search Terms',
                    icon: ArrowRight,
                    onClick: () => handleHeadlineClick(headline.filterAction),
                  }}
                />
              ))}
            </div>
          )}

          {summary && (
            <>
              <QuickStatsBar
                items={[
                  {
                    label: 'Unique Search Terms',
                    value: formatNumber(summary.unique_search_terms),
                  },
                  {
                    label: 'Total Impressions',
                    value: formatNumber(summary.total_impressions),
                  },
                  {
                    label: 'Total Clicks',
                    value: formatNumber(summary.total_clicks),
                  },
                  {
                    label: 'Total Conversions',
                    value: formatNumber(summary.total_conversions),
                  },
                ]}
              />
              <p className="text-sm text-gray-600 mt-4">
                This analysis covers all search terms that received at least 100 impressions in the selected
                period, covering {summary.terms_with_conversions.toLocaleString()} out of{' '}
                {summary.unique_search_terms.toLocaleString()} total recorded conversions.
              </p>
            </>
          )}

          <div id="keyword-performance-table">
            {keywordsLoading ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8">
                <div className="flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <span className="ml-3 text-gray-600 mt-3">Loading keyword data...</span>
                  <p className="text-sm text-gray-500 mt-2 text-center max-w-md">
                    This may take 30-60 seconds for retailers with large keyword datasets.
                    <br />
                    <strong>Note:</strong> Pre-calculated insights (coming soon) will load instantly.
                  </p>
                </div>
              </div>
            ) : keywords.length > 0 ? (
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
                    format: 'percent',
                    sortable: true,
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
                    format: 'percent',
                    sortable: true,
                  },
                ]}
                filters={
                  summary
                    ? [
                        {
                          key: 'all',
                          label: 'All Search Terms',
                          count: summary.unique_search_terms,
                          tooltip: 'Show all search terms with ≥10 impressions',
                        },
                        {
                          key: 'star',
                          label: 'Star',
                          count: summary.tier_star,
                          icon: Star,
                          color: '#2563EB',
                          tooltip:
                            'Star performers: CVR ≥10% AND CTR ≥3% - Top converting search terms with excellent engagement',
                        },
                        {
                          key: 'strong',
                          label: 'Strong',
                          count: summary.tier_strong,
                          icon: TrendingUp,
                          color: '#14B8A6',
                          tooltip: 'Strong performers: CVR ≥5% OR (CTR ≥2% AND CVR ≥3%) - High conversion efficiency',
                        },
                        {
                          key: 'underperforming',
                          label: 'Underperforming',
                          count: summary.tier_underperforming,
                          icon: TrendingDown,
                          color: '#F59E0B',
                          tooltip: 'Underperforming: CVR ≥2% OR CTR ≥1.5% - Room for improvement',
                        },
                        {
                          key: 'poor',
                          label: 'Poor',
                          count: summary.tier_poor,
                          icon: XCircle,
                          color: '#DC2626',
                          tooltip: 'Poor: CVR <2% OR no conversions - Needs optimisation',
                        },
                      ]
                    : []
                }
                defaultFilter={filterTier}
                onFilterChange={(filter) => setFilterTier(filter as PerformanceTier | 'all')}
                defaultSort={{ key: sortMetric, direction: 'desc' }}
                onSortChange={handleSortChange}
                pageSize={50}
              />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-8">
                <p className="text-center text-gray-500">No keyword data available for this period.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'word-performance' && <WordAnalysis retailerId={retailerId} />}

      {activeSubTab === 'market-insights' && <KeywordMarketInsights retailerId={retailerId} />}
    </div>
  )
}
