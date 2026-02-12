'use client'

import { useEffect, useMemo, useState } from 'react'
import { Star, CheckCircle, TrendingDown, XCircle, ChevronDown } from 'lucide-react'
import { PerformanceTable } from '@/components/shared'

interface CompetitorComparisonProps {
  retailerId: string
}

interface Competitor {
  label: string
  is_current_retailer: boolean
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  cvr: number
  ctr_rank: number
  cvr_rank: number
  performance_tier: 'star' | 'strong' | 'underperforming' | 'poor'
}

interface CategoryData {
  category: string
  category_path: string[]
  total_competitors: number
  data_date: string
  competitors: Competitor[]
}

interface CompetitorComparisonData {
  data_date: string
  categories: CategoryData[]
}

const formatNumber = (num: number): string => new Intl.NumberFormat('en-GB').format(num)

const mockData: CompetitorComparisonData = {
  data_date: new Date().toISOString(),
  categories: [
    {
      category: 'Skincare',
      category_path: ['Beauty', 'Skincare'],
      total_competitors: 12,
      data_date: new Date().toISOString(),
      competitors: [
        {
          label: 'You (ShareView)',
          is_current_retailer: true,
          impressions: 120000,
          clicks: 6200,
          ctr: 5.2,
          conversions: 540,
          cvr: 8.7,
          ctr_rank: 2,
          cvr_rank: 1,
          performance_tier: 'star',
        },
        {
          label: 'Competitor A',
          is_current_retailer: false,
          impressions: 95000,
          clicks: 4800,
          ctr: 5.1,
          conversions: 420,
          cvr: 8.2,
          ctr_rank: 3,
          cvr_rank: 2,
          performance_tier: 'strong',
        },
        {
          label: 'Competitor B',
          is_current_retailer: false,
          impressions: 88000,
          clicks: 4200,
          ctr: 4.8,
          conversions: 290,
          cvr: 6.9,
          ctr_rank: 5,
          cvr_rank: 4,
          performance_tier: 'underperforming',
        },
      ],
    },
    {
      category: 'Makeup',
      category_path: ['Beauty', 'Makeup'],
      total_competitors: 9,
      data_date: new Date().toISOString(),
      competitors: [
        {
          label: 'You (ShareView)',
          is_current_retailer: true,
          impressions: 86000,
          clicks: 3900,
          ctr: 4.5,
          conversions: 300,
          cvr: 7.7,
          ctr_rank: 3,
          cvr_rank: 2,
          performance_tier: 'strong',
        },
        {
          label: 'Competitor C',
          is_current_retailer: false,
          impressions: 92000,
          clicks: 4500,
          ctr: 4.9,
          conversions: 270,
          cvr: 6.0,
          ctr_rank: 2,
          cvr_rank: 5,
          performance_tier: 'underperforming',
        },
      ],
    },
  ],
}

export default function CompetitorComparison({ retailerId }: CompetitorComparisonProps) {
  const [data, setData] = useState<CompetitorComparisonData | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<'star' | 'strong' | 'underperforming' | 'poor' | 'all'>('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    try {
      setLoading(true)
      setData(mockData)
      setSelectedCategory(mockData.categories[0]?.category || '')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load competitor comparison data')
    } finally {
      setLoading(false)
    }
  }, [retailerId])

  const currentCategoryData = useMemo(() => {
    if (!data) return null
    return data.categories.find((cat) => cat.category === selectedCategory) || data.categories[0]
  }, [data, selectedCategory])

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

  if (!currentCategoryData) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
        No competitor comparison data available yet.
      </div>
    )
  }

  const tableData = currentCategoryData.competitors.map((comp, idx) => ({
    rank: idx + 1,
    name: comp.label,
    impressions: comp.impressions,
    clicks: comp.clicks,
    ctr: comp.ctr,
    conversions: comp.conversions,
    cvr: comp.cvr,
    performance_tier: comp.performance_tier,
    ctr_rank: comp.ctr_rank,
    cvr_rank: comp.cvr_rank,
    is_current_retailer: comp.is_current_retailer,
  }))

  const tierCounts = {
    all: currentCategoryData.competitors.length,
    star: currentCategoryData.competitors.filter((c) => c.performance_tier === 'star').length,
    strong: currentCategoryData.competitors.filter((c) => c.performance_tier === 'strong').length,
    underperforming: currentCategoryData.competitors.filter((c) => c.performance_tier === 'underperforming').length,
    poor: currentCategoryData.competitors.filter((c) => c.performance_tier === 'poor').length,
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Competitor Comparison: {selectedCategory}
          </h2>

          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {selectedCategory}
              <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="py-1">
                  {data?.categories.map((cat) => (
                    <button
                      key={cat.category}
                      onClick={() => {
                        setSelectedCategory(cat.category)
                        setDropdownOpen(false)
                        setFilterTier('all')
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                        selectedCategory === cat.category ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {cat.category}
                      <span className="text-xs text-gray-500 ml-2">
                        ({cat.total_competitors} competitors)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-600">
          Comparing performance against {currentCategoryData.total_competitors - 1} anonymous competitors in the{' '}
          {currentCategoryData.category_path.join(' › ')} category.
        </p>
      </div>

      <PerformanceTable
        data={filteredData}
        columns={[
          { key: 'rank', label: '#', align: 'left' },
          {
            key: 'name',
            label: 'Competitor',
            align: 'left',
            sortable: true,
            render: (row: { name: string; is_current_retailer: boolean }) => (
              <span className={row.is_current_retailer ? 'font-bold text-blue-600' : ''}>{row.name}</span>
            ),
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
            sortable: true,
            render: (row: { impressions: number }) => formatNumber(row.impressions),
          },
          {
            key: 'clicks',
            label: 'Clicks',
            align: 'right',
            sortable: true,
            render: (row: { clicks: number }) => formatNumber(row.clicks),
          },
          {
            key: 'ctr',
            label: 'CTR',
            align: 'right',
            sortable: true,
            render: (row: { ctr: number }) => `${row.ctr.toFixed(2)}%`,
          },
          {
            key: 'ctr_rank',
            label: 'CTR Rank',
            align: 'center',
            sortable: true,
            render: (row: { ctr_rank: number }) => `${row.ctr_rank}/${currentCategoryData.total_competitors}`,
          },
          {
            key: 'conversions',
            label: 'Conversions',
            align: 'right',
            sortable: true,
            render: (row: { conversions: number }) => formatNumber(row.conversions),
          },
          {
            key: 'cvr',
            label: 'CVR',
            align: 'right',
            sortable: true,
            render: (row: { cvr: number }) => `${row.cvr.toFixed(2)}%`,
          },
          {
            key: 'cvr_rank',
            label: 'CVR Rank',
            align: 'center',
            sortable: true,
            render: (row: { cvr_rank: number }) => `${row.cvr_rank}/${currentCategoryData.total_competitors}`,
          },
        ]}
        filters={[
          { key: 'all', label: 'All Competitors', count: tierCounts.all, tooltip: 'Show all competitors' },
          { key: 'star', label: 'Star', count: tierCounts.star, icon: Star, color: '#2563EB', tooltip: 'Top 20% performers' },
          { key: 'strong', label: 'Strong', count: tierCounts.strong, icon: CheckCircle, color: '#14B8A6', tooltip: 'Top 40% on one metric' },
          { key: 'underperforming', label: 'Underperforming', count: tierCounts.underperforming, icon: TrendingDown, color: '#F59E0B', tooltip: 'Below average performance' },
          { key: 'poor', label: 'Poor', count: tierCounts.poor, icon: XCircle, color: '#DC2626', tooltip: 'Bottom 20% performance' },
        ]}
        defaultFilter={filterTier}
        onFilterChange={(key) => setFilterTier(key as typeof filterTier)}
        pageSize={10}
      />
    </div>
  )
}
