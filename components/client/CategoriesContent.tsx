'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Star, TrendingUp, TrendingDown, XCircle, Minus, ChevronRight } from 'lucide-react'
import { QuickStatsBar, PerformanceTable, SubTabNavigation } from '@/components/shared'
import type { Column } from '@/components/shared'
import CategoryMarketInsights from '@/components/client/MarketInsights/CategoryMarketInsights'
import CompetitorComparison from './CompetitorComparison'
import ReportsSubTab from './ReportsSubTab'
import CategoryTreeNavigator from './CategoryTreeNavigator'
import { fetchCategoryPerformance, type CategoryResponse } from '@/lib/api-client'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import type { CategoryData } from '@/types'

type PerformanceTier = 'star' | 'strong' | 'underperforming' | 'poor' | 'none'

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
  no_own_data: boolean
}

interface CategoriesContentProps {
  retailerId: string
  retailerConfig?: { insights?: boolean; market_insights?: boolean }
  visibleMetrics?: string[]
  featuresEnabled?: Record<string, boolean>
}

export default function CategoriesContent({
  retailerId,
  retailerConfig,
  visibleMetrics,
  featuresEnabled: featuresEnabledProp,
}: CategoriesContentProps) {
  const { period } = useDateRange()

  // Derive feature flags from either prop format
  const features = retailerConfig || {}
  const featuresEnabled = featuresEnabledProp ?? {
    insights: features.insights ?? true,
    market_insights: features.market_insights ?? true,
  }

  // Sub-tab state — owned here (mirrors ProductsContent pattern)
  const [activeSubTab, setActiveSubTab] = useState('performance')

  const subTabs = [
    { id: 'performance', label: 'Performance' },
    ...(featuresEnabled.market_insights !== false
      ? [{ id: 'market-comparison', label: 'Market Comparison' }]
      : []),
    ...(featuresEnabled.insights !== false
      ? [{ id: 'insights', label: 'Insights' }]
      : []),
  ]

  const [snapshot, setSnapshot] = useState<CategoryResponse | null>(null)
  const [rootSummary, setRootSummary] = useState<CategoryResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<PerformanceTier | 'all'>('all')
  const [sortMetric, setSortMetric] = useState<'conversions' | 'impressions'>('conversions')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [selectedIsLeaf, setSelectedIsLeaf] = useState(false)
  const [nodeOnlyMode, setNodeOnlyMode] = useState(false)

  const handleNavigate = (path: string | null, isLeaf = false) => {
    setCurrentPath(path)
    setSelectedIsLeaf(path !== null && isLeaf)
  }

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)

  // Fetch full portfolio summary once per period — QuickStatsBar uses this as a fixed reference
  // so it doesn't change when the user navigates into subcategories.
  useEffect(() => {
    if (activeSubTab !== 'performance') return
    const fetchRoot = async () => {
      try {
        const result = await fetchCategoryPerformance(retailerId, { period })
        setRootSummary(result.summary)
      } catch (err) {
        console.error('Error fetching root category summary:', err)
      }
    }
    fetchRoot()
  }, [retailerId, activeSubTab, period])

  useEffect(() => {
    if (activeSubTab !== 'performance') return

    const fetchSnapshot = async () => {
      try {
        setLoading(true)
        const result = await fetchCategoryPerformance(retailerId, {
          ...(selectedIsLeaf && currentPath
            ? { full_path: currentPath }
            : { parent_path: currentPath || undefined }),
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
  }, [retailerId, activeSubTab, currentPath, selectedIsLeaf, nodeOnlyMode, period])

  // Reset filter when path or mode changes
  useEffect(() => {
    setFilterTier('all')
  }, [currentPath, nodeOnlyMode])

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
      case 'strong':
        return {
          Icon: TrendingUp,
          label: 'STRONG',
          bgColor: 'bg-teal-50',
          textColor: 'text-teal-700',
          borderColor: 'border-teal-200',
        }
      case 'underperforming':
        return {
          Icon: TrendingDown,
          label: 'UNDERPERFORMING',
          bgColor: 'bg-amber-50',
          textColor: 'text-amber-700',
          borderColor: 'border-amber-200',
        }
      case 'poor':
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
          textColor: 'text-gray-500',
          borderColor: 'border-gray-200',
        }
    }
  }

  const impressionsColumn: Column<CategoryRow> = {
    key: 'impressions',
    label: 'Impressions',
    align: 'right',
    sortable: true,
    render: (row) =>
      row.no_own_data
        ? <span className="text-gray-400">0</span>
        : <span>{row.impressions.toLocaleString()}</span>,
  }

  const clicksColumn: Column<CategoryRow> = {
    key: 'clicks',
    label: 'Clicks',
    align: 'right',
    sortable: true,
    render: (row) =>
      row.no_own_data
        ? <span className="text-gray-400">—</span>
        : <span>{row.clicks.toLocaleString()}</span>,
  }

  const ctrColumn: Column<CategoryRow> = {
    key: 'ctr',
    label: 'CTR',
    align: 'right',
    sortable: true,
    render: (row) =>
      row.no_own_data
        ? <span className="text-gray-400">—</span>
        : <span>{row.ctr != null ? `${Number(row.ctr).toFixed(2)}%` : '—'}</span>,
  }

  const conversionsColumn: Column<CategoryRow> = {
    key: 'conversions',
    label: 'Conversions',
    align: 'right',
    sortable: true,
    render: (row) =>
      row.no_own_data
        ? <span className="text-gray-400">—</span>
        : <span>{row.conversions.toLocaleString()}</span>,
  }

  const cvrColumn: Column<CategoryRow> = {
    key: 'cvr',
    label: 'CVR',
    align: 'right',
    sortable: true,
    render: (row) =>
      row.no_own_data
        ? <span className="text-gray-400">—</span>
        : <span>{row.cvr != null ? `${Number(row.cvr).toFixed(2)}%` : '—'}</span>,
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
    setCurrentPath(cat.full_path)
    setSelectedIsLeaf(!cat.has_children)
  }

  const filteredCategories = useMemo(() => {
    if (!snapshot) return []

    let filtered = snapshot.categories.filter((cat) => cat.category_level1 !== null && cat.category_level1 !== '')

    if (filterTier !== 'all') {
      filtered = filtered.filter((cat) => (cat.health_status || 'none') === filterTier)
    }

    return [...filtered].sort((a, b) => {
      // Unknown/none always goes to the bottom
      const aNone = !a.health_status || a.health_status === 'none'
      const bNone = !b.health_status || b.health_status === 'none'
      if (aNone && !bNone) return 1
      if (!aNone && bNone) return -1

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
          count: snapshot.categories.filter((c) => c.category_level1 !== null && c.category_level1 !== '').length,
          tooltip: 'Show all categories',
        },
        {
          key: 'star',
          label: 'Star',
          count: healthSummary?.star.count || 0,
          icon: Star,
          color: '#2563EB',
          tooltip: 'Star: CVR and CTR are both above the portfolio average',
        },
        {
          key: 'strong',
          label: 'Strong',
          count: healthSummary?.strong.count || 0,
          icon: TrendingUp,
          color: '#14B8A6',
          tooltip: 'Strong: CVR is above the portfolio average (CTR below average)',
        },
        {
          key: 'underperforming',
          label: 'Underperforming',
          count: healthSummary?.underperforming.count || 0,
          icon: TrendingDown,
          color: '#F59E0B',
          tooltip: 'Underperforming: CVR is below the portfolio average',
        },
        {
          key: 'poor',
          label: 'Poor',
          count: healthSummary?.poor.count || 0,
          icon: XCircle,
          color: '#DC2626',
          tooltip: 'Poor: CVR is well below the portfolio average, or no conversions recorded',
        },
      ]
    : []

  if (error) {
    return (
      <div className="space-y-4">
        <SubTabNavigation activeTab={activeSubTab} tabs={subTabs} onTabChange={setActiveSubTab} />
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
    <div className="space-y-4">
      <SubTabNavigation activeTab={activeSubTab} tabs={subTabs} onTabChange={setActiveSubTab} />

      {activeSubTab === 'performance' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <span className="ml-3 text-gray-600 mt-3">Loading category performance data...</span>
              </div>
            </div>
          ) : snapshot ? (
            <>
              {/* Quick Stats Bar — always shows full portfolio totals regardless of navigation */}
              <QuickStatsBar
                items={[
                  isMetricVisible('impressions')
                    ? {
                        label: 'Impressions',
                        value: formatNumber((rootSummary || snapshot.summary).total_impressions),
                      }
                    : null,
                  isMetricVisible('clicks')
                    ? {
                        label: 'Clicks',
                        value: formatNumber((rootSummary || snapshot.summary).total_clicks),
                      }
                    : null,
                  isMetricVisible('conversions')
                    ? {
                        label: 'Conversions',
                        value: formatNumber((rootSummary || snapshot.summary).total_conversions),
                      }
                    : null,
                  isMetricVisible('ctr')
                    ? {
                        label: 'CTR',
                        value: `${Number((rootSummary || snapshot.summary).overall_ctr || 0).toFixed(2)}%`,
                      }
                    : null,
                  isMetricVisible('cvr')
                    ? {
                        label: 'CVR',
                        value: `${Number((rootSummary || snapshot.summary).overall_cvr || 0).toFixed(2)}%`,
                      }
                    : null,
                ].filter(Boolean) as Array<{ label: string; value: string }>}
              />

              {/* Hierarchical tree navigator */}
              <CategoryTreeNavigator
                retailerId={retailerId}
                currentPath={currentPath}
                onNavigate={handleNavigate}
                nodeOnlyMode={nodeOnlyMode}
                onToggleNodeOnly={setNodeOnlyMode}
                period={period}
              />

              {/* Performance table */}
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
                    no_own_data: nodeOnlyMode && cat.impressions === 0,
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
                                  const cat = filteredCategories.find((c) => c.full_path === fullPath)
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
                                {childCount} {childCount === 1 ? 'category' : 'categories'}
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
                        if (row.no_own_data) {
                          return <span className="text-gray-400 text-sm">—</span>
                        }
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
                  pageSize={25}
                />
              </div>
            </>
          ) : null}
        </div>
      )}

      {activeSubTab === 'market-comparison' && <CompetitorComparison retailerId={retailerId} />}

      {activeSubTab === 'insights' && <CategoryMarketInsights retailerId={retailerId} />}

      {activeSubTab === 'reports' && featuresEnabled && (
        <ReportsSubTab retailerId={retailerId} domain="categories" featuresEnabled={featuresEnabled} />
      )}
    </div>
  )
}

