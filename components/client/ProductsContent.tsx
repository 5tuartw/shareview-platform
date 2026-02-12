'use client'

import { useEffect, useMemo, useState } from 'react'
import { Star, CheckCircle } from 'lucide-react'
import { DateRangeSelector, PerformanceTable, QuickStatsBar } from '@/components/shared'
import { fetchProductsOverview, fetchProductPerformance, type ProductPerformanceResponse } from '@/lib/api-client'
import type { ProductsOverview } from '@/types'
import ProductsCompetitorComparison from './ProductsCompetitorComparison'
import ProductsMarketInsights from '@/components/client/MarketInsights/ProductsMarketInsights'

interface ProductsContentProps {
  retailerId: string
  activeSubTab: string
  selectedMonth: string
  onMonthChange: (month: string) => void
  visibleMetrics?: string[]
}

const formatNumber = (num: number): string => new Intl.NumberFormat('en-GB').format(num)

type ProductColumn = {
  key: string
  label: string
  align: 'left' | 'center' | 'right'
  sortable?: boolean
  render?: (row: { product_title?: string; tier?: 'star' | 'good'; impressions?: number; clicks?: number; ctr?: number; conversions?: number; cvr?: number }) => JSX.Element | string
}

export default function ProductsContent({
  retailerId,
  activeSubTab,
  selectedMonth,
  onMonthChange,
  visibleMetrics,
}: ProductsContentProps) {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<ProductsOverview | null>(null)
  const [performanceData, setPerformanceData] = useState<ProductPerformanceResponse | null>(null)
  const [topPerformersFilter, setTopPerformersFilter] = useState<'all' | 'star' | 'good'>('all')
  const [activeTab, setActiveTab] = useState<'top' | 'underperformers'>('top')

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)

  const availableMonths = useMemo(() => [{ value: '2025-11', label: 'November 2025' }], [])

  useEffect(() => {
    if (activeSubTab === 'competitor-comparison') return

    const loadData = async () => {
      try {
        setLoading(true)
        const [overviewData, perfData] = await Promise.all([
          fetchProductsOverview(retailerId, selectedMonth),
          fetchProductPerformance(retailerId, selectedMonth),
        ])

        setOverview(overviewData)
        setPerformanceData(perfData)
      } catch (err) {
        console.error('Failed to load products data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [retailerId, selectedMonth, activeSubTab])

  if (activeSubTab === 'competitor-comparison') {
    return (
      <ProductsCompetitorComparison
        retailerId={retailerId}
        selectedMonth={selectedMonth}
        onMonthChange={onMonthChange}
      />
    )
  }

  if (activeSubTab === 'market-insights') {
    if (loading) {
      return (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600 mt-3">Loading product insights...</span>
          </div>
        </div>
      )
    }

    if (!overview) {
      return (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No product insights available for the selected period.
        </div>
      )
    }

    return <ProductsMarketInsights retailerId={retailerId} overview={overview} />
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600 mt-3">Loading product performance data...</span>
        </div>
      </div>
    )
  }

  if (!overview || !performanceData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        No product data available for the selected period.
      </div>
    )
  }

  const filteredTopPerformers = topPerformersFilter === 'all'
    ? performanceData.top_performers
    : performanceData.top_performers.filter((product) => product.tier === topPerformersFilter)

  const topPerformersTableData = filteredTopPerformers.map((product, idx) => ({
    rank: idx + 1,
    ...product,
  }))

  const underperformersTableData = performanceData.underperformers.map((product, idx) => ({
    rank: idx + 1,
    ...product,
  }))

  const getTierBadge = (tier: 'star' | 'good') => {
    if (tier === 'star') {
      return {
        Icon: Star,
        label: 'Star',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
      }
    }
    return {
      Icon: CheckCircle,
      label: 'Good',
      bgColor: 'bg-teal-50',
      textColor: 'text-teal-700',
      borderColor: 'border-teal-200',
    }
  }

  const topPerformersColumns = [
    { key: 'rank', label: '#', align: 'center' as const, sortable: false },
    {
      key: 'product_title',
      label: 'Product',
      align: 'left' as const,
      sortable: true,
      render: (row: { product_title: string }) => (
        <div className="max-w-md truncate font-medium text-gray-900">{row.product_title}</div>
      ),
    },
    {
      key: 'tier',
      label: 'Tier',
      align: 'center' as const,
      sortable: true,
      render: (row: { tier: 'star' | 'good' }) => {
        const badge = getTierBadge(row.tier)
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
    isMetricVisible('impressions')
      ? {
          key: 'impressions',
          label: 'Impressions',
          align: 'right' as const,
          sortable: true,
          render: (row: { impressions: number }) => formatNumber(row.impressions),
        }
      : null,
    isMetricVisible('clicks')
      ? {
          key: 'clicks',
          label: 'Clicks',
          align: 'right' as const,
          sortable: true,
          render: (row: { clicks: number }) => formatNumber(row.clicks),
        }
      : null,
    isMetricVisible('ctr')
      ? {
          key: 'ctr',
          label: 'CTR',
          align: 'right' as const,
          sortable: true,
          render: (row: { ctr: number }) => `${row.ctr.toFixed(2)}%`,
        }
      : null,
    isMetricVisible('conversions')
      ? {
          key: 'conversions',
          label: 'Conversions',
          align: 'right' as const,
          sortable: true,
          render: (row: { conversions: number }) => formatNumber(row.conversions),
        }
      : null,
    isMetricVisible('cvr')
      ? {
          key: 'cvr',
          label: 'CVR',
          align: 'right' as const,
          sortable: true,
          render: (row: { cvr: number }) => `${row.cvr.toFixed(2)}%`,
        }
      : null,
  ].filter((column): column is ProductColumn => Boolean(column))

  const underperformersColumns = [
    { key: 'rank', label: '#', align: 'center' as const, sortable: false },
    {
      key: 'product_title',
      label: 'Product',
      align: 'left' as const,
      sortable: true,
      render: (row: { product_title: string }) => (
        <div className="max-w-md truncate font-medium text-gray-900">{row.product_title}</div>
      ),
    },
    isMetricVisible('impressions')
      ? {
          key: 'impressions',
          label: 'Impressions',
          align: 'right' as const,
          sortable: true,
          render: (row: { impressions: number }) => formatNumber(row.impressions),
        }
      : null,
    isMetricVisible('clicks')
      ? {
          key: 'clicks',
          label: 'Clicks',
          align: 'right' as const,
          sortable: true,
          render: (row: { clicks: number }) => formatNumber(row.clicks),
        }
      : null,
    isMetricVisible('ctr')
      ? {
          key: 'ctr',
          label: 'CTR',
          align: 'right' as const,
          sortable: true,
          render: (row: { ctr: number }) => `${row.ctr.toFixed(2)}%`,
        }
      : null,
  ].filter((column): column is ProductColumn => Boolean(column))

  const totalProducts = overview.total_products
  const pct50 = ((overview.products_driving_50_pct / totalProducts) * 100).toFixed(2)
  const pct80 = ((overview.products_driving_80_pct / totalProducts) * 100).toFixed(2)
  const pctWasted = ((overview.products_with_wasted_clicks / totalProducts) * 100).toFixed(2)

  const quickStats = [
    {
      label: 'Total Unique Products',
      value: formatNumber(overview.total_products),
      color: '#6B7280',
    },
    isMetricVisible('conversions')
      ? {
          label: 'Products driving 50% conversions',
          value: `${formatNumber(overview.products_driving_50_pct)} (${pct50}%)`,
          color: '#2563EB',
        }
      : null,
    isMetricVisible('conversions')
      ? {
          label: 'Products driving 80% conversions',
          value: `${formatNumber(overview.products_driving_80_pct)} (${pct80}%)`,
          color: '#4F46E5',
        }
      : null,
    isMetricVisible('clicks')
      ? {
          label: 'Products with wasted clicks (no conversions)',
          value: `${formatNumber(overview.products_with_wasted_clicks)} (${pctWasted}%)`,
          color: '#F97316',
        }
      : null,
    isMetricVisible('clicks')
      ? {
          label: 'Total Wasted Clicks',
          value: `${formatNumber(overview.total_wasted_clicks)} (${overview.wasted_clicks_percentage}%)`,
          color: '#DC2626',
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; color?: string }>

  return (
    <div className="space-y-6">
      <DateRangeSelector
        selectedMonth={selectedMonth}
        onChange={onMonthChange}
        availableMonths={availableMonths}
      />

      <QuickStatsBar items={quickStats} />

      {performanceData && (
        <div className="space-y-6">
          <div className="border-b border-gray-200">
            <nav className="flex gap-8">
              <button
                onClick={() => setActiveTab('top')}
                className={`pb-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'top'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Top Performers ({formatNumber(performanceData.top_performers.length)} products)
              </button>
              <button
                onClick={() => setActiveTab('underperformers')}
                className={`pb-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'underperformers'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Top 100 Products by Wasted Clicks
              </button>
            </nav>
          </div>

          {activeTab === 'top' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Products that make up the top 80% of conversions. Star tier = top 50%, Good tier = next 30%.
              </p>
              <PerformanceTable
                data={topPerformersTableData}
                columns={topPerformersColumns}
                pageSize={25}
                filters={[
                  {
                    key: 'all',
                    label: 'All Products',
                    count: performanceData.top_performers.length,
                    tooltip: 'Show all top performers',
                  },
                  {
                    key: 'star',
                    label: 'Star',
                    count: performanceData.top_performers.filter((p) => p.tier === 'star').length,
                    icon: Star,
                    color: '#2563EB',
                    tooltip: 'Products in top 50% of conversions (highest CVR)',
                  },
                  {
                    key: 'good',
                    label: 'Good',
                    count: performanceData.top_performers.filter((p) => p.tier === 'good').length,
                    icon: CheckCircle,
                    color: '#14B8A6',
                    tooltip: 'Products in next 30% of conversions',
                  },
                ]}
                defaultFilter={topPerformersFilter}
                onFilterChange={(filter) => setTopPerformersFilter(filter as 'all' | 'star' | 'good')}
              />
            </div>
          )}

          {activeTab === 'underperformers' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Products with 0 conversions despite receiving clicks. Ordered by clicks (highest first).
              </p>
              <div className="bg-white rounded-lg border border-gray-200">
                <PerformanceTable
                  data={underperformersTableData}
                  columns={underperformersColumns}
                  pageSize={25}
                  filters={[]}
                  defaultFilter={'all'}
                  onFilterChange={() => {}}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
