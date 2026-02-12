'use client'

import React, { useEffect, useState } from 'react'
import { TrendingUp, AlertTriangle, Star, Target, Lightbulb, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { fetchWordAnalysis, type WordAnalysisResponse } from '@/lib/api-client'

interface WordAnalysisProps {
  retailerId: string
}

type ViewMode = 'all' | 'star' | 'good' | 'dead' | 'poor'
type SortField = 'conversions' | 'clicks' | 'impressions' | 'efficiency' | 'keywords'
type SortDirection = 'asc' | 'desc'

export default function WordAnalysis({ retailerId }: WordAnalysisProps) {
  const [words, setWords] = useState<WordAnalysisResponse['words']>([])
  const [summary, setSummary] = useState<WordAnalysisResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [sortField, setSortField] = useState<SortField>('conversions')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const result = await fetchWordAnalysis(retailerId)

        let sortedWords = result.words || []
        if (sortDirection === 'asc') {
          sortedWords = [...sortedWords].reverse()
        }

        setWords(sortedWords)
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
  }, [retailerId, viewMode, sortField, sortDirection])

  const formatNumber = (num: number | null | undefined): string => {
    if (num == null) return '0'
    return num.toLocaleString()
  }

  const getTierColor = (tier: string): string => {
    switch (tier) {
      case 'star':
        return 'bg-purple-100 text-purple-800 border-purple-300'
      case 'good':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'average':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      case 'poor':
        return 'bg-amber-100 text-amber-800 border-amber-300'
      case 'dead':
        return 'bg-red-100 text-red-800 border-red-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'star':
        return <Star size={14} className="fill-current" />
      case 'good':
        return <TrendingUp size={14} />
      case 'poor':
        return <AlertTriangle size={14} />
      case 'dead':
        return <AlertTriangle size={14} className="fill-current" />
      default:
        return null
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />
    }
    return sortDirection === 'desc' ? (
      <ArrowDown size={14} className="text-blue-600" />
    ) : (
      <ArrowUp size={14} className="text-blue-600" />
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

  const wastedClicksPercent = summary.total_clicks > 0
    ? ((summary.wasted_clicks / summary.total_clicks) * 100).toFixed(1)
    : 0

  const filteredWords = viewMode === 'all'
    ? words
    : words.filter(word => word.performance_tier === viewMode)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Target size={24} className="text-blue-600" />
            Word Performance Analysis
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Individual word insights from {formatNumber(summary.total_words)} analysed words
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {summary.dead_words > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-bold text-red-800 text-sm">Wasted Click Alert</h3>
                <p className="text-sm text-gray-700 mt-1">
                  <strong>{summary.dead_words}</strong> words getting clicks but zero conversions.
                  <span className="block text-xs mt-1">
                    {summary.wasted_clicks} clicks wasted ({wastedClicksPercent}% of total)
                  </span>
                </p>
                <button
                  onClick={() => setViewMode('dead')}
                  className="text-xs text-red-700 font-semibold mt-2 hover:underline"
                >
                  View Problem Words →
                </button>
              </div>
            </div>
          </div>
        )}

        {(summary.star_words > 0 || summary.good_words > 0) && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4">
            <div className="flex items-start gap-2">
              <Star className="text-green-600 flex-shrink-0 mt-0.5 fill-current" size={20} />
              <div>
                <h3 className="font-bold text-green-800 text-sm">Power Words Found</h3>
                <p className="text-sm text-gray-700 mt-1">
                  <strong>{summary.star_words + summary.good_words}</strong> high-performing words converting well.
                  <span className="block text-xs mt-1">These drive {summary.total_conversions} conversions</span>
                </p>
                <button
                  onClick={() => setViewMode('good')}
                  className="text-xs text-green-700 font-semibold mt-2 hover:underline"
                >
                  View Winners →
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-bold text-blue-800 text-sm">Quick Action</h3>
              <p className="text-sm text-gray-700 mt-1">
                Focus on fixing {Math.min(summary.dead_words, 5)} dead words first.
                <span className="block text-xs mt-1">
                  Potential to recover {Math.min(summary.wasted_clicks, 100)} clicks
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Filter by:</span>
        {(['all', 'star', 'good', 'dead', 'poor'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              viewMode === mode
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {mode === 'all' ? 'All' : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Word
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 cursor-pointer"
                onClick={() => handleSort('keywords')}
              >
                Keywords {getSortIcon('keywords')}
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 cursor-pointer"
                onClick={() => handleSort('impressions')}
              >
                Impressions {getSortIcon('impressions')}
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 cursor-pointer"
                onClick={() => handleSort('clicks')}
              >
                Clicks {getSortIcon('clicks')}
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 cursor-pointer"
                onClick={() => handleSort('conversions')}
              >
                Conversions {getSortIcon('conversions')}
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 cursor-pointer"
                onClick={() => handleSort('efficiency')}
              >
                Efficiency {getSortIcon('efficiency')}
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">
                Tier
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredWords.map((word, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{word.word}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{formatNumber(word.keyword_count)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{formatNumber(word.total_impressions)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{formatNumber(word.total_clicks)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{formatNumber(word.total_conversions)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {word.click_to_conversion_pct.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border ${getTierColor(
                      word.performance_tier
                    )}`}
                  >
                    {getTierIcon(word.performance_tier)}
                    {word.performance_tier}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
