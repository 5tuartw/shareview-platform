'use client'

import { useEffect, useState } from 'react'
import { Star, CheckCircle, TrendingDown, XCircle, Circle } from 'lucide-react'
import { DateRangeSelector, PerformanceTable } from '@/components/shared'
import { fetchProductPerformance, type ProductPerformanceResponse } from '@/lib/api-client'

interface ProductsCompetitorComparisonProps {
  retailerId: string
  selectedMonth: string
  onMonthChange?: (month: string) => void
}

interface Competitor {
  retailer_id: string
  label: string
  is_current_retailer: boolean
  total_products: number
  total_conversions: number
  avg_ctr: number
  avg_cvr: number
  cvr_rank: number
  products_driving_50_pct: number
  products_driving_80_pct: number
  products_with_wasted_clicks: number
  total_wasted_clicks: number
  wasted_clicks_percentage: number
  performance_tier: 'star' | 'strong' | 'underperforming' | 'poor'
}

interface ProductsComparisonData {
  data_date: string
  total_competitors: number
  competitors: Competitor[]
}

const formatNumber = (num: number): string => new Intl.NumberFormat('en-GB').format(num)

const mockData: ProductsComparisonData = {
  data_date: new Date().toISOString(),
  total_competitors: 5,
  competitors: [
    {
      retailer_id: 'current',
      label: 'You (ShareView)',
      is_current_retailer: true,
      total_products: 28000,
      total_conversions: 6100,
      avg_ctr: 3.2,
      avg_cvr: 4.1,
      cvr_rank: 1,
      products_driving_50_pct: 420,
      products_driving_80_pct: 1200,
      products_with_wasted_clicks: 8200,
      total_wasted_clicks: 31000,
      wasted_clicks_percentage: 21.4,
      performance_tier: 'star',
    },
    {
      retailer_id: 'comp-a',
      label: 'Competitor A',
      is_current_retailer: false,
      total_products: 35000,
      total_conversions: 5200,
      avg_ctr: 2.6,
      avg_cvr: 3.2,
      cvr_rank: 3,
      products_driving_50_pct: 780,
      products_driving_80_pct: 2100,
      products_with_wasted_clicks: 12000,
      total_wasted_clicks: 47000,
      wasted_clicks_percentage: 28.6,
      performance_tier: 'underperforming',
    },
    {
      retailer_id: 'comp-b',
      label: 'Competitor B',
      is_current_retailer: false,
      total_products: 26000,
      total_conversions: 4300,
      avg_ctr: 2.9,
      avg_cvr: 3.5,
      cvr_rank: 2,
      products_driving_50_pct: 520,
      products_driving_80_pct: 1400,
      products_with_wasted_clicks: 9000,
      total_wasted_clicks: 36000,
      wasted_clicks_percentage: 24.1,
      performance_tier: 'strong',
    },
  ],
}

export default function ProductsCompetitorComparison({
  retailerId,
  selectedMonth,
  onMonthChange,
}: ProductsCompetitorComparisonProps) {
  const [data, setData] = useState<ProductsComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<'star' | 'strong' | 'underperforming' | 'poor' | 'all'>('all')
  const [selectedRetailer, setSelectedRetailer] = useState<{ id: string; label: string } | null>(null)
  const [performanceData, setPerformanceData] = useState<ProductPerformanceResponse | null>(null)
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [activePerformanceTab, setActivePerformanceTab] = useState<'top' | 'underperformers'>('top')
  const [topPerformersFilter, setTopPerformersFilter] = useState<'all' | 'star' | 'good'>('all')

  const availableMonths = [{ value: '2025-11', label: 'November 2025' }]

  useEffect(() => {
    try {
      setLoading(true)
      setData(mockData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load competitor comparison data')
    } finally {
      setLoading(false)
    }
  }, [retailerId, selectedMonth])

  const handleRetailerClick = async (competitor: Competitor) => {
    if (selectedRetailer?.id === competitor.retailer_id) {
      setSelectedRetailer(null)
      setPerformanceData(null)
      return
    }

    setSelectedRetailer({ id: competitor.retailer_id, label: competitor.label })
    setPerformanceLoading(true)
    try {
      const performance = await fetchProductPerformance(competitor.retailer_id, selectedMonth)
      setPerformanceData(performance)
      setActivePerformanceTab('top')
      setTopPerformersFilter('all')
    } catch (err) {
      console.error('Failed to load performance data:', err)
    } finally {
      setPerformanceLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600 mt-3">Loading competitor comparison data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8">
        <p className="text-red-600 text-center">{error}</p>
      </div>
    )
  }

  if (!data || !data.competitors || data.competitors.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
        No competitor comparison data available yet.
      </div>
    )
  }

  const tableData = data.competitors.map((comp, idx) => ({
    rank: idx + 1,
    retailer_id: comp.retailer_id,
    name: comp.label,
    total_products: comp.total_products,
    products_driving_50_pct: comp.products_driving_50_pct,
    products_driving_80_pct: comp.products_driving_80_pct,
    products_with_wasted_clicks: comp.products_with_wasted_clicks,
    total_wasted_clicks: comp.total_wasted_clicks,
    wasted_clicks_percentage: comp.wasted_clicks_percentage,
    avg_cvr: comp.avg_cvr,
    cvr_rank: comp.cvr_rank,
    performance_tier: comp.performance_tier,
    is_current_retailer: comp.is_current_retailer,
    is_selected: selectedRetailer?.id === comp.retailer_id,
  }))

  const tierCounts = {
    all: data.competitors.length,
    star: data.competitors.filter((c) => c.performance_tier === 'star').length,
    strong: data.competitors.filter((c) => c.performance_tier === 'strong').length,
    underperforming: data.competitors.filter((c) => c.performance_tier === 'underperforming').length,
    poor: data.competitors.filter((c) => c.performance_tier === 'poor').length,
  }

  const filteredData = filterTier === 'all'
    ? tableData
    : tableData.filter((row) => row.performance_tier === filterTier)

  const getTierBadge = (tier: string) => {
    const badges = {
      star: {
        label: 'Star',
        Icon: Star,
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
      },
      strong: {
        label: 'Strong',
        Icon: CheckCircle,
        bgColor: 'bg-teal-50',
        textColor: 'text-teal-700',
        borderColor: 'border-teal-200',
      },
      underperforming: {
        label: 'Underperforming',
        Icon: TrendingDown,
        bgColor: 'bg-amber-50',
        textColor: 'text-amber-700',
        borderColor: 'border-amber-200',
      },
      poor: {
        label: 'Poor',
        Icon: XCircle,
        bgColor: 'bg-red-50',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
      },
    }
    return badges[tier as keyof typeof badges] || badges.poor
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Products Competitor Comparison</h2>
        <p className="text-sm text-gray-600">
          Comparing your product portfolio performance against {data.total_competitors - 1} anonymous competitors,
          ordered by conversion rate (CVR).
        </p>
      </div>

      {onMonthChange && (
        <DateRangeSelector
          selectedMonth={selectedMonth}
          onChange={onMonthChange}
          availableMonths={availableMonths}
        />
      )}

      <PerformanceTable
        data={filteredData}
        columns={[
          { key: 'rank', label: '#', align: 'center' },
          {
            key: 'name',
            label: 'Retailer',
            align: 'left',
            sortable: true,
            render: (row: { retailer_id: string; name: string; is_current_retailer: boolean; is_selected: boolean }) => {
              const competitor = data.competitors.find((c) => c.retailer_id === row.retailer_id)
              if (!competitor) return row.name

              return (
                <button
                  onClick={() => handleRetailerClick(competitor)}
                  className={`flex items-center gap-2 hover:text-blue-600 transition-colors ${
                    row.is_current_retailer ? 'font-bold text-blue-600' : ''
                  }`}
                >
                  {row.is_selected ? (
                    <CheckCircle className="w-4 h-4 text-blue-600 fill-blue-600" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300" />
                  )}
                  {row.name}
                </button>
              )
            },
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
            key: 'total_products',
            label: 'Total Products',
            align: 'right',
            sortable: true,
            render: (row: { total_products: number }) => formatNumber(row.total_products),
          },
          {
            key: 'products_driving_50_pct',
            label: 'Products Driving 50%',
            align: 'right',
            sortable: true,
            render: (row: { products_driving_50_pct: number }) => formatNumber(row.products_driving_50_pct),
          },
          {
            key: 'products_driving_80_pct',
            label: 'Products Driving 80%',
            align: 'right',
            sortable: true,
            render: (row: { products_driving_80_pct: number }) => formatNumber(row.products_driving_80_pct),
          },
          {
            key: 'products_with_wasted_clicks',
            label: 'Products with Wasted Clicks',
            align: 'right',
            sortable: true,
            render: (row: { products_with_wasted_clicks: number }) => formatNumber(row.products_with_wasted_clicks),
          },
          {
            key: 'total_wasted_clicks',
            label: 'Total Wasted Clicks',
            align: 'right',
            sortable: true,
            render: (row: { total_wasted_clicks: number; wasted_clicks_percentage: number }) => (
              <span>
                {formatNumber(row.total_wasted_clicks)}
                <span className="text-xs text-gray-500 ml-1">({row.wasted_clicks_percentage}%)</span>
              </span>
            ),
          },
          {
            key: 'avg_cvr',
            label: 'CVR',
            align: 'right',
            sortable: true,
            render: (row: { avg_cvr: number }) => `${row.avg_cvr.toFixed(2)}%`,
          },
          {
            key: 'cvr_rank',
            label: 'CVR Rank',
            align: 'center',
            sortable: true,
            render: (row: { cvr_rank: number }) => `${row.cvr_rank}/${data.total_competitors}`,
          },
        ]}
        filters={[
          { key: 'all', label: 'All Competitors', count: tierCounts.all, tooltip: 'Show all competitors' },
          { key: 'star', label: 'Star', count: tierCounts.star, icon: Star, color: '#2563EB', tooltip: 'Excellent CVR performance' },
          { key: 'strong', label: 'Strong', count: tierCounts.strong, icon: CheckCircle, color: '#14B8A6', tooltip: 'Above average conversion rates' },
          { key: 'underperforming', label: 'Underperforming', count: tierCounts.underperforming, icon: TrendingDown, color: '#F59E0B', tooltip: 'Below average CVR' },
          { key: 'poor', label: 'Poor', count: tierCounts.poor, icon: XCircle, color: '#DC2626', tooltip: 'Low CVR performance' },
        ]}
        defaultFilter={filterTier}
        onFilterChange={(key) => setFilterTier(key as typeof filterTier)}
        pageSize={10}
      />

      {selectedRetailer && (
        <div className="mt-8 pt-8 border-t-2 border-gray-300">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Product Performance: {selectedRetailer.label}
            </h3>
            <p className="text-sm text-gray-600">
              Detailed product breakdown showing top performers and underperformers.
            </p>
          </div>

          {performanceLoading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <span className="ml-3 text-gray-600 mt-3">Loading performance data...</span>
              </div>
            </div>
          ) : performanceData ? (
            <div className="space-y-6">
              <div className="border-b border-gray-200">
                <nav className="flex gap-8">
                  <button
                    onClick={() => setActivePerformanceTab('top')}
                    className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activePerformanceTab === 'top'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Top Performers ({performanceData.top_performers.length})
                  </button>
                  <button
                    onClick={() => setActivePerformanceTab('underperformers')}
                    className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activePerformanceTab === 'underperformers'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Top 100 Products by Wasted Clicks
                  </button>
                </nav>
              </div>

              {activePerformanceTab === 'top' && (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Products driving 80% of conversions (star = top 50%, good = next 30%).
                  </p>
                  <div className="bg-white rounded-lg border border-gray-200">
                    <PerformanceTable
                      data={performanceData.top_performers
                        .filter((p) => topPerformersFilter === 'all' || p.tier === topPerformersFilter)
                        .map((p, idx) => ({ rank: idx + 1, ...p }))}
                      columns={getTopPerformersColumns()}
                      pageSize={25}
                      filters={[
                        { key: 'all', label: 'All', count: performanceData.top_performers.length },
                        { key: 'star', label: 'Star', count: performanceData.top_performers.filter((p) => p.tier === 'star').length, icon: Star, color: '#2563EB' },
                        { key: 'good', label: 'Good', count: performanceData.top_performers.filter((p) => p.tier === 'good').length, icon: CheckCircle, color: '#14B8A6' },
                      ]}
                      defaultFilter={topPerformersFilter}
                      onFilterChange={(key) => setTopPerformersFilter(key as typeof topPerformersFilter)}
                    />
                  </div>
                </div>
              )}

              {activePerformanceTab === 'underperformers' && (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Products with 0 conversions despite receiving clicks. Ordered by clicks (highest first).
                  </p>
                  <div className="bg-white rounded-lg border border-gray-200">
                    <PerformanceTable
                      data={performanceData.underperformers.map((p, idx) => ({ rank: idx + 1, ...p }))}
                      columns={getUnderperformersColumns()}
                      pageSize={25}
                      filters={[]}
                      defaultFilter={'all'}
                      onFilterChange={() => {}}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
              No performance data available.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getTopPerformersColumns() {
  const format = (num: number) => new Intl.NumberFormat('en-GB').format(num)
  return [
    { key: 'rank', label: '#', align: 'center' as const },
    { key: 'product_title', label: 'Product', align: 'left' as const, sortable: true },
    {
      key: 'tier',
      label: 'Tier',
      align: 'center' as const,
      sortable: true,
      render: (row: { tier: 'star' | 'good' }) => {
        const Icon = row.tier === 'star' ? Star : CheckCircle
        const colours = row.tier === 'star'
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-teal-50 text-teal-700 border-teal-200'
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border ${colours}`}>
            <Icon className="w-3 h-3" />
            {row.tier === 'star' ? 'Star' : 'Good'}
          </span>
        )
      },
    },
    { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, render: (row: { impressions: number }) => format(row.impressions) },
    { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, render: (row: { clicks: number }) => format(row.clicks) },
    { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, render: (row: { ctr: number }) => `${row.ctr.toFixed(2)}%` },
    { key: 'conversions', label: 'Conversions', align: 'right' as const, sortable: true, render: (row: { conversions: number }) => format(row.conversions) },
    { key: 'cvr', label: 'CVR', align: 'right' as const, sortable: true, render: (row: { cvr: number }) => `${row.cvr.toFixed(2)}%` },
  ]
}

function getUnderperformersColumns() {
  const format = (num: number) => new Intl.NumberFormat('en-GB').format(num)
  return [
    { key: 'rank', label: '#', align: 'center' as const },
    { key: 'product_title', label: 'Product', align: 'left' as const, sortable: true },
    { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, render: (row: { impressions: number }) => format(row.impressions) },
    { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, render: (row: { clicks: number }) => format(row.clicks) },
    { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, render: (row: { ctr: number }) => `${row.ctr.toFixed(2)}%` },
  ]
}
