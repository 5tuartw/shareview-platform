'use client'

import { useEffect, useMemo, useState } from 'react'
import { Package, TrendingUp, XCircle, Eye } from 'lucide-react'
import { DateRangeSelector, PerformanceTable, QuickStatsBar } from '@/components/shared'
import type { Column } from '@/components/shared'
import ProductsCompetitorComparison from './ProductsCompetitorComparison'
import ProductsMarketInsights from '@/components/client/MarketInsights/ProductsMarketInsights'
import ReportsSubTab from './ReportsSubTab'

interface ProductsContentProps {
  retailerId: string
  activeSubTab: string
  selectedMonth: string
  onMonthChange: (month: string) => void
  visibleMetrics?: string[]
  featuresEnabled?: Record<string, boolean>
  reportsApiUrl?: string
}

const formatNumber = (num: number): string => new Intl.NumberFormat('en-GB').format(num)

type ProductClassification = 'top_converters' | 'lowest_converters' | 'top_click_through' | 'high_impressions_no_clicks'

interface ProductData {
  item_id: string
  product_title: string
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cvr: number
}

interface MetricCard {
  label: string
  value: number | string
  subtitle?: string
  change?: number
  changeUnit?: '%' | 'pp'
  status?: 'success' | 'warning' | 'critical'
}

interface ProductsResponse {
  summary: {
    total_products: number
    total_impressions: number
    total_clicks: number
    total_conversions: number
    avg_ctr: number
    avg_cvr: number
    products_with_conversions: number
    products_with_clicks_no_conversions: number
    clicks_without_conversions: number
  }
  products: ProductData[]
  metric_cards: MetricCard[]
  classifications: {
    top_converters_count: number
    lowest_converters_count: number
    top_click_through_count: number
    high_impressions_no_clicks_count: number
  }
  period: string
}

type ProductRow = {
 rank: number
  item_id: string
  product_title: string
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cvr: number
}

async function fetchProducts(retailerId: string, period: string, filter: ProductClassification | 'all' = 'all'): Promise<ProductsResponse> {
  const params = new URLSearchParams({ period, filter })
  const response = await fetch(`/api/retailers/${retailerId}/products?${params}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`)
  }
  return response.json()
}

export default function ProductsContent({
  retailerId,
  activeSubTab,
  selectedMonth,
  onMonthChange,
  visibleMetrics,
  featuresEnabled,
  reportsApiUrl,
}: ProductsContentProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ProductsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterClassification, setFilterClassification] = useState<ProductClassification | 'all'>('all')

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)

  const availableMonths = useMemo(() => [
    { value: '2026-02', label: 'February 2026' },
    { value: '2025-11', label: 'November 2025' },
  ], [])

  useEffect(() => {
    if (activeSubTab !== 'performance') return

    const loadData = async () => {
      try {
        setLoading(true)
        const result = await fetchProducts(retailerId, selectedMonth, filterClassification)
        setData(result)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        console.error('Failed to load products data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [retailerId, selectedMonth, filterClassification, activeSubTab])

  if (activeSubTab === 'reports' && featuresEnabled) {
    return <ReportsSubTab retailerId={retailerId} domain="products" featuresEnabled={featuresEnabled} apiEndpoint={reportsApiUrl} />
  }

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

    if (!data) {
      return (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No product insights available for the selected period.
        </div>
      )
    }

    // Convert data to ProductsOverview format for market insights
    const overview = {
      total_products: data.summary.total_products,
      total_conversions: data.summary.total_conversions,
      avg_ctr: data.summary.avg_ctr,
      avg_cvr: data.summary.avg_cvr,
      top_1_pct_products: 0,
      top_1_pct_conversions_share: 0,
      top_5_pct_products: 0,
      top_5_pct_conversions_share: 0,
      top_10_pct_products: 0,
      top_10_pct_conversions_share: 0,
      star_products: 0,
      strong_products: 0,
      moderate_products: 0,
      underperforming_products: 0,
      critical_products: 0,
      top_products: [],
      products_driving_50_pct: 0,
      products_driving_80_pct: 0,
      products_with_wasted_clicks: data.summary.products_with_clicks_no_conversions,
      total_wasted_clicks: data.summary.clicks_without_conversions,
      wasted_clicks_percentage: Number(((data.summary.clicks_without_conversions / Math.max(data.summary.total_clicks, 1)) * 100).toFixed(1)),
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

  if (error || !data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-red-600">{error || 'No product data available for the selected period.'}</p>
      </div>
    )
  }

  const productTableData: ProductRow[] = data.products.map((p, idx) => ({
    rank: idx + 1,
    ...p,
  }))

  const columns: Column<ProductRow>[] = [
    { key: 'rank', label: '#', align: 'left', sortable: false },
    {
      key: 'product_title',
      label: 'Product',
      align: 'left',
      sortable: true,
      render: (row) => (
        <div className="max-w-md">
          <div className="font-medium text-gray-900 truncate">{row.product_title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{row.item_id}</div>
        </div>
      ),
    },
    ...(isMetricVisible('impressions')
      ? [
          {
            key: 'impressions' as const,
            label: 'Impressions',
            align: 'right' as const,
            sortable: true,
            render: (row: ProductRow) => formatNumber(row.impressions),
          },
        ]
      : []),
    ...(isMetricVisible('clicks')
      ? [
          {
            key: 'clicks' as const,
            label: 'Clicks',
            align: 'right' as const,
            sortable: true,
            render: (row: ProductRow) => formatNumber(row.clicks),
          },
        ]
      : []),
    ...(isMetricVisible('ctr')
      ? [
          {
            key: 'ctr' as const,
            label: 'CTR',
            align: 'right' as const,
            sortable: true,
            render: (row: ProductRow) => `${row.ctr.toFixed(2)}%`,
          },
        ]
      : []),
    ...(isMetricVisible('conversions')
      ? [
          {
            key: 'conversions' as const,
            label: 'Conversions',
            align: 'right' as const,
            sortable: true,
            render: (row: ProductRow) => formatNumber(row.conversions),
          },
        ]
      : []),
    ...(isMetricVisible('cvr')
      ? [
          {
            key: 'cvr' as const,
            label: 'CVR',
            align: 'right' as const,
            sortable: true,
            render: (row: ProductRow) => `${row.cvr.toFixed(2)}%`,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <DateRangeSelector
        selectedMonth={selectedMonth}
        onChange={onMonthChange}
        availableMonths={availableMonths}
        showQuickSelect={false}
      />

      {data.metric_cards && (
        <QuickStatsBar
          items={data.metric_cards.map((card) => ({
            label: card.label,
            value: typeof card.value === 'number' ? formatNumber(card.value) : card.value,
            subtitle: card.subtitle,
            ...(card.change !== undefined && {
              change: card.change,
              changeUnit: card.changeUnit,
              status: card.status,
            }),
          }))}
        />
      )}

      <div id="product-performance-table">
        {data.products.length > 0 ? (
          <PerformanceTable
            data={productTableData}
            columns={columns}
            filters={[
              {
                key: 'all',
                label: 'All Products',
                count: data.summary.total_products,
                tooltip: 'Show all products',
              },
              {
                key: 'top_converters',
                label: 'Top Converters',
                count: data.classifications.top_converters_count,
                icon: Package,
                color: '#2563EB',
                tooltip:
                  'Products with highest conversion rates (top 500 or products making up 50% of conversions)',
              },
              {
                key: 'lowest_converters',
                label: 'Lowest Converters',
                count: data.classifications.lowest_converters_count,
                icon: XCircle,
                color: '#DC2626',
                tooltip: 'Products with 0 conversions ordered by clicks (top 200)',
              },
              {
                key: 'top_click_through',
                label: 'Top Click-Through',
                count: data.classifications.top_click_through_count,
                icon: TrendingUp,
                color: '#14B8A6',
                tooltip: 'Products with highest CTR ordered by impressions (top 500)',
              },
              {
                key: 'high_impressions_no_clicks',
                label: 'High Impressions, No Clicks',
                count: data.classifications.high_impressions_no_clicks_count,
                icon: Eye,
                color: '#F97316',
                tooltip: 'Products with most impressions but 0 clicks (top 200)',
              },
            ]}
            defaultFilter={filterClassification}
            onFilterChange={(filter) => setFilterClassification(filter as ProductClassification | 'all')}
            pageSize={25}
          />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            No products available for the selected classification.
          </div>
        )}
      </div>
    </div>
  )
}
