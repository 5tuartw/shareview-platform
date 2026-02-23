'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Star, CheckCircle, TrendingDown, XCircle, Minus, ChevronRight } from 'lucide-react'
import { QuickStatsBar, PerformanceTable } from '@/components/shared'
import type { Column } from '@/components/shared'
import CategoryMarketInsights from '@/components/client/MarketInsights/CategoryMarketInsights'
import CompetitorComparison from './CompetitorComparison'
import ReportsSubTab from './ReportsSubTab'
import CategoryNavigator from './CategoryNavigator'
import { fetchCategoryPerformance, type CategoryResponse } from '@/lib/api-client'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import type { CategoryData } from '@/types'

type PerformanceTier = 'star' | 'healthy' | 'attention' | 'underperforming' | 'broken' | 'none'

type CategoryRow = {
  rank: number
  category: string
  full_path: string
  has_children: boolean
  child_count: number
  level1: string | null
  level2: string | null
  level3: string | null
  performance_tier: string
  impressions: number
  clicks: number
  ctr: number | null
  conversions: number
  cvr: number | null
}

interface CategoriesContentProps {
  retailerId: string
  activeSubTab: string
  visibleMetrics?: string[]
  featuresEnabled?: Record<string, boolean>
}

export default function CategoriesContent({
  retailerId,
  activeSubTab,
  visibleMetrics,
  featuresEnabled,
}: CategoriesContentProps) {
  const { period } = useDateRange()
  const [snapshot, setSnapshot] = useState<CategoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<PerformanceTier | 'all'>('all')
  const [sortMetric, setSortMetric] = useState<'conversions' | 'impressions'>('conversions')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [nodeOnlyMode, setNodeOnlyMode] = useState(false)

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)

  useEffect(() => {
    if (activeSubTab !== 'performance') return

    const fetchSnapshot = async () => {
      try {
        setLoading(true)
        const result = await fetchCategoryPerformance(retailerId, {
          parent_path: currentPath || undefined,
          node_only: nodeOnlyMode,
          period,
        })
        setSnapshot(result)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        console.error('Error fetching categories:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSnapshot()
  }, [retailerId, activeSubTab, currentPath, nodeOnlyMode, period])

  const formatNumber = (num: number | null | undefined): string => {
    if (num == null) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toLocaleString()
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
      case 'healthy':
        return {
          Icon: CheckCircle,
          label: 'HEALTHY',
          bgColor: 'bg-teal-50',
          textColor: 'text-teal-700',
          borderColor: 'border-teal-200',
        }
      case 'attention':
        return {
          Icon: TrendingDown,
          label: 'ATTENTION',
          bgColor: 'bg-amber-50',
          textColor: 'text-amber-700',
          borderColor: 'border-amber-200',
        }
      case 'underperforming':
        return {
          Icon: TrendingDown,
          label: 'UNDERPERFORMING',
          bgColor: 'bg-orange-50',
          textColor: 'text-orange-700',
          borderColor: 'border-orange-200',
        }
      case 'broken':
        return {
          Icon: XCircle,
          label: 'BROKEN',
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

  const impressionsColumn: Column<CategoryRow> = {
    key: 'impressions',
    label: 'Impressions',
    align: 'right',
    sortable: true,
    format: 'number',
  }

  const clicksColumn: Column<CategoryRow> = {
    key: 'clicks',
    label: 'Clicks',
    align: 'right',
    sortable: true,
    format: 'number',
  }

  const ctrColumn: Column<CategoryRow> = {
    key: 'ctr',
    label: 'CTR',
    align: 'right',
    sortable: true,
    format: 'percent',
  }

  const conversionsColumn: Column<CategoryRow> = {
    key: 'conversions',
    label: 'Conversions',
    align: 'right',
    sortable: true,
    format: 'number',
  }

  const cvrColumn: Column<CategoryRow> = {
    key: 'cvr',
    label: 'CVR',
    align: 'right',
    sortable: true,
    format: 'percent',
  }

  const handleSortChange = (key: string) => {
    if (key === 'conversions' || key === 'impressions') {
      setSortMetric(key as 'conversions' | 'impressions')
    }
  }

  const getCategoryDisplayName = (cat: CategoryData): string => {
    return cat.full_path || cat.category || 'Unknown'
  }

  const handleCategoryClick = (cat: CategoryData) => {
    if (cat.has_children) {
      setCurrentPath(cat.full_path)
    }
  }

  const filteredCategories = useMemo(() => {
    if (!snapshot) return []

    let filtered = snapshot.categories

    if (filterTier !== 'all') {
      filtered = filtered.filter((cat) => (cat.health_status || 'none') === filterTier)
    }

    return [...filtered].sort((a, b) => {
      if (sortMetric === 'conversions') {
        return b.conversions - a.conversions
      }
      return b.impressions - a.impressions
    })
  }, [snapshot, filterTier, sortMetric])

  const healthSummary = snapshot?.health_summary
  const filterOptions = snapshot
    ? [
        {
          key: 'all',
          label: 'All Categories',
          count: snapshot.categories.length,
          tooltip: 'Show all categories',
        },
        {
          key: 'star',
          label: 'Star',
          count: healthSummary?.star.count || 0,
          icon: Star,
          color: '#2563EB',
          tooltip: 'Exceptional performance across CTR and CVR',
        },
        {
          key: 'healthy',
          label: 'Healthy',
          count: healthSummary?.healthy.count || 0,
          icon: CheckCircle,
          color: '#14B8A6',
          tooltip: 'On-track performance in the portfolio',
        },
        {
          key: 'attention',
          label: 'Attention',
          count: healthSummary?.attention.count || 0,
          icon: TrendingDown,
          color: '#F59E0B',
          tooltip: 'Needs improvement in CTR or CVR',
        },
        {
          key: 'underperforming',
          label: 'Underperforming',
          count: healthSummary?.underperforming.count || 0,
          icon: TrendingDown,
          color: '#F97316',
          tooltip: 'Below portfolio averages',
        },
        {
          key: 'broken',
          label: 'Broken',
          count: healthSummary?.broken.count || 0,
          icon: XCircle,
          color: '#DC2626',
          tooltip: 'Critical performance gap',
        },
      ]
    : []

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertCircle size={20} />
            <div>
              <h3 className="font-semibold">Category Data Unavailable</h3>
              <p className="text-sm text-gray-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {activeSubTab === 'performance' && (
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <span className="ml-3 text-gray-600 mt-3">Loading category performance data...</span>
              </div>
            </div>
          ) : snapshot ? (
            <>
              <CategoryNavigator
                currentPath={currentPath}
                onNavigate={setCurrentPath}
                nodeOnlyMode={nodeOnlyMode}
                onToggleNodeOnly={setNodeOnlyMode}
              />

              <QuickStatsBar
                items={[
                  {
                    label: 'Total Categories',
                    value: formatNumber(snapshot.categories.length),
                  },
                  isMetricVisible('impressions')
                    ? {
                        label: 'Total Impressions',
                        value: formatNumber(snapshot.summary.total_impressions),
                      }
                    : null,
                  isMetricVisible('clicks')
                    ? {
                        label: 'Total Clicks',
                        value: formatNumber(snapshot.summary.total_clicks),
                      }
                    : null,
                  isMetricVisible('conversions')
                    ? {
                        label: 'Total Conversions',
                        value: formatNumber(snapshot.summary.total_conversions),
                      }
                    : null,
                  isMetricVisible('ctr')
                    ? {
                        label: 'Overall CTR',
                        value: `${Number(snapshot.summary.overall_ctr || 0).toFixed(2)}%`,
                      }
                    : null,
                  isMetricVisible('cvr')
                    ? {
                        label: 'Overall CVR',
                        value: `${Number(snapshot.summary.overall_cvr || 0).toFixed(2)}%`,
                      }
                    : null,
                ].filter(Boolean) as Array<{ label: string; value: string }>}
              />

              <div id="category-performance-table">
                <PerformanceTable
                  data={filteredCategories.map((cat, idx) => ({
                    rank: idx + 1,
                    category: getCategoryDisplayName(cat),
                    full_path: cat.full_path,
                    has_children: cat.has_children,
                    child_count: cat.child_count,
                    level1: cat.category_level1,
                    level2: cat.category_level2,
                    level3: cat.category_level3,
                    performance_tier: cat.health_status || 'none',
                    impressions: cat.impressions,
                    clicks: cat.clicks,
                    ctr: cat.ctr,
                    conversions: cat.conversions,
                    cvr: cat.cvr,
                  }))}
                  columns={([
                    { key: 'rank', label: '#', align: 'left' },
                    {
                      key: 'category',
                      label: 'Category',
                      align: 'left',
                      sortable: true,
                      render: (row) => {
                        const hasChildren = row.has_children as boolean
                        const childCount = row.child_count as number
                        const fullPath = row.full_path as string
                        
                        return (
                          <div className="flex items-center gap-2">
                            {hasChildren ? (
                              <button
                                onClick={() => {
                                  const cat = filteredCategories.find(c => c.full_path === fullPath)
                                  if (cat) handleCategoryClick(cat)
                                }}
                                className="text-left hover:text-blue-600 transition-colors flex items-center gap-1.5 group"
                              >
                                <span className="font-medium">{row.category}</span>
                                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                              </button>
                            ) : (
                              <span className="font-medium">{row.category}</span>
                            )}
                            {hasChildren && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {childCount} {childCount === 1 ? 'subcat' : 'subcats'}
                              </span>
                            )}
                          </div>
                        )
                      },
                    },
                    {
                      key: 'performance_tier',
                      label: 'Performance',
                      align: 'center',
                      sortable: true,
                      render: (row) => {
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
                    ...(isMetricVisible('impressions') ? [impressionsColumn] : []),
                    ...(isMetricVisible('clicks') ? [clicksColumn] : []),
                    ...(isMetricVisible('ctr') ? [ctrColumn] : []),
                    ...(isMetricVisible('conversions') ? [conversionsColumn] : []),
                    ...(isMetricVisible('cvr') ? [cvrColumn] : []),
                  ] as Column<CategoryRow>[])}
                  filters={filterOptions}
                  defaultFilter={filterTier}
                  onFilterChange={(key) => setFilterTier(key as PerformanceTier | 'all')}
                  onSortChange={(key) => handleSortChange(key)}
                  pageSize={10}
                />
              </div>
            </>
          ) : null}
        </div>
      )}

      {activeSubTab === 'competitor-comparison' && <CompetitorComparison retailerId={retailerId} />}

      {activeSubTab === 'market-insights' && <CategoryMarketInsights retailerId={retailerId} />}

      {activeSubTab === 'reports' && featuresEnabled && (
        <ReportsSubTab retailerId={retailerId} domain="categories" featuresEnabled={featuresEnabled} />
      )}
    </div>
  )
}
