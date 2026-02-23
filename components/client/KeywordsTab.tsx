'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCcw, Trophy, AlertTriangle, Sparkles, XCircle } from 'lucide-react'
import { PageHeadline, MetricCard, InsightsPanel } from '@/components/shared'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import SearchTermsSubTabs from '@/components/client/SearchTermsSubTabs'
import KeywordPerformanceTable from '@/components/client/KeywordPerformanceTable'
import WordAnalysis from '@/components/client/WordAnalysis'
import { calculateSearchTermsHeadline } from '@/lib/insights/calculate-page-headline'
import type { PageInsightsResponse } from '@/types'

interface KeywordsTabProps {
  retailerId: string
  retailerConfig?: { insights?: boolean; market_insights?: boolean }
}

interface KeywordPerformance {
  search_term: string
  total_impressions: number
  total_clicks: number
  total_conversions: number
  ctr: number
  conversion_rate: number
  performance_tier: string
  first_seen: string
  last_seen: string
  days_active?: number
}

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

interface MetricCardData {
  label: string
  value: string | number
  change?: number
  changeUnit?: '%' | 'pp' | ''
  status?: 'success' | 'warning' | 'critical' | 'neutral'
  subtitle?: string
}

interface QuadrantKeyword {
  search_term: string
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cvr: number
}

interface Quadrants {
  winners: QuadrantKeyword[]
  css_wins_retailer_loses: QuadrantKeyword[]
  hidden_gems: QuadrantKeyword[]
  poor_performers: QuadrantKeyword[]
  median_ctr: number
}

interface KeywordsResponse {
  keywords: KeywordPerformance[]
  summary: KeywordSummary
  metricCards: MetricCardData[]
  quadrants?: Quadrants
}

export default function KeywordsTab({ retailerId, retailerConfig }: KeywordsTabProps) {
  const { period, periodType, start, end } = useDateRange()
  const [activeSubTab, setActiveSubTab] = useState('performance')
  const [selectedQuadrant, setSelectedQuadrant] = useState<'winners' | 'css_wins_retailer_loses' | 'hidden_gems' | 'poor_performers'>('winners')
  const [keywordsData, setKeywordsData] = useState<KeywordsResponse | null>(null)
  const [insights, setInsights] = useState<PageInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const features = retailerConfig || { insights: true, market_insights: true }
  const allowedTabs = useMemo(() => {
    return [
      'performance',
      ...(features.insights ? ['insights'] : []),
      ...(features.market_insights ? ['market-insights'] : []),
    ]
  }, [features.insights, features.market_insights])

  // Initialize sub-tab from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialTab = params.get('searchTermsSubTab') || 'performance'
    setActiveSubTab(allowedTabs.includes(initialTab) ? initialTab : 'performance')
  }, [allowedTabs])

  // Fallback if tab becomes unavailable
  useEffect(() => {
    if (!allowedTabs.includes(activeSubTab)) {
      setActiveSubTab('performance')
    }
  }, [activeSubTab, allowedTabs])

  // Update URL when sub-tab changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('searchTermsSubTab', activeSubTab)
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [activeSubTab])

  const fetchInsights = async (tab: string) => {
    const response = await fetch(
      `/api/page-insights?retailerId=${retailerId}&pageType=search-terms&tab=${tab}&period=${period}`
    )

    if (!response.ok) {
      throw new Error('Unable to load insights')
    }

    return (await response.json()) as PageInsightsResponse
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [keywordsResponse, insightsResponse] = await Promise.all([
        fetch(`/api/retailers/${retailerId}/keywords?period=${period}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetchInsights(activeSubTab === 'market-insights' ? 'market-insights' : activeSubTab),
      ])

      if (!keywordsResponse.ok) {
        throw new Error('Unable to load search terms data')
      }

      const keywordsJson = (await keywordsResponse.json()) as KeywordsResponse
      const insightsJson = insightsResponse

      setKeywordsData(keywordsJson)
      setInsights(insightsJson)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load search terms data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!retailerId) return
    loadData()
  }, [retailerId, period, activeSubTab])

  // Calculate PageHeadline
  const headline = useMemo(() => {
    if (!keywordsData?.summary || !keywordsData?.quadrants || periodType === 'custom') {
      return null
    }

    const metrics = {
      totalKeywords: keywordsData.summary.unique_search_terms,
      highPerformers: keywordsData.quadrants.winners.length,
      avgCVR: keywordsData.summary.overall_cvr,
      periodLabel: period,
    }

    return calculateSearchTermsHeadline(metrics)
  }, [keywordsData?.summary, keywordsData?.quadrants, periodType, period])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-12 rounded-lg bg-gray-200 animate-pulse" />
        <div className="h-24 rounded-lg bg-gray-200 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-gray-200 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start gap-3 text-amber-600">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">Search terms data unavailable</h3>
              <p className="text-sm text-gray-600 mt-1">{error}</p>
              <button
                type="button"
                onClick={loadData}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <RefreshCcw className="w-4 h-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!keywordsData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
        No data available for this period.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SearchTermsSubTabs
        activeSubTab={activeSubTab}
        onSubTabChange={setActiveSubTab}
        retailerConfig={features}
      />

      {activeSubTab === 'performance' && (
        <>
          {headline && periodType !== 'custom' && (
            <PageHeadline status={headline.status} message={headline.message} subtitle={headline.subtitle} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {keywordsData.metricCards?.map((card, idx) => (
              <MetricCard
                key={idx}
                label={card.label}
                value={card.value}
                change={card.change}
                changeUnit={card.changeUnit}
                status={card.status || 'neutral'}
                subtitle={card.subtitle}
              />
            ))}
          </div>

          {keywordsData.quadrants && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Quadrants</h3>
            <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedQuadrant('winners')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-green-100 text-green-800 ${
                    selectedQuadrant === 'winners'
                      ? 'border-2 border-green-600'
                      : 'border border-green-300'
                  }`}
                >
                  <Trophy className="w-4 h-4" />
                  High CTR & High Conversions ({keywordsData.quadrants.winners.length})
                </button>
                <button
                  onClick={() => setSelectedQuadrant('hidden_gems')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-100 text-blue-800 ${
                    selectedQuadrant === 'hidden_gems'
                      ? 'border-2 border-blue-600'
                      : 'border border-blue-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Low CTR, High Conversions ({keywordsData.quadrants.hidden_gems.length})
                </button>
                <button
                  onClick={() => setSelectedQuadrant('css_wins_retailer_loses')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-amber-100 text-amber-800 ${
                    selectedQuadrant === 'css_wins_retailer_loses'
                      ? 'border-2 border-amber-600'
                      : 'border border-amber-300'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  High CTR, Low Conversions ({keywordsData.quadrants.css_wins_retailer_loses.length})
                </button>
                <button
                  onClick={() => setSelectedQuadrant('poor_performers')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-red-100 text-red-800 ${
                    selectedQuadrant === 'poor_performers'
                      ? 'border-2 border-red-600'
                      : 'border border-red-300'
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  Low CTR, Low Conversions ({keywordsData.quadrants.poor_performers.length})
                </button>
              </div>

              <div className="text-sm text-gray-600">
                {selectedQuadrant === 'winners' && (
                  <p>High-performing search terms with above-median CTR ({keywordsData.quadrants.median_ctr.toFixed(2)}%) and strong conversions. Scale these opportunities.</p>
                )}
                {selectedQuadrant === 'css_wins_retailer_loses' && (
                  <p>Search terms with high CTR but low conversions. These indicate potential issues with product pages, pricing, or stock availability.</p>
                )}
                {selectedQuadrant === 'hidden_gems' && (
                  <p>Converting search terms with below-median CTR ({keywordsData.quadrants.median_ctr.toFixed(2)}%). Improving CSS targeting and ad copy here can drive more traffic to proven converters.</p>
                )}
                {selectedQuadrant === 'poor_performers' && (
                  <p>Search terms with below-median CTR ({keywordsData.quadrants.median_ctr.toFixed(2)}%) and no conversions. Consider pausing or optimising these terms.</p>
                )}
              </div>

              <KeywordPerformanceTable
                keywords={keywordsData.quadrants[selectedQuadrant].map(k => ({
                  search_term: k.search_term,
                  total_impressions: k.impressions,
                  total_clicks: k.clicks,
                  total_conversions: k.conversions,
                  ctr: k.ctr,
                  conversion_rate: k.cvr,
                  performance_tier: selectedQuadrant === 'winners' ? 'star' : selectedQuadrant === 'hidden_gems' ? 'strong' : 'poor',
                  first_seen: '',
                  last_seen: '',
                  days_active: 0,
                }))}
                summary={keywordsData.summary}
                loading={loading}
                error={error}
              />
            </div>
          )}

          <WordAnalysis retailerId={retailerId} />
        </>
      )}

      {activeSubTab === 'insights' && insights?.insightsPanel ? (
        <InsightsPanel
          title={insights.insightsPanel.title}
          insights={insights.insightsPanel.insights}
          singleColumn={insights.insightsPanel.singleColumn}
        />
      ) : activeSubTab === 'insights' ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          No insights published for this period yet.
        </div>
      ) : null}

      {activeSubTab === 'market-insights' && insights?.insightsPanel ? (
        <InsightsPanel
          title={insights.insightsPanel.title || 'Market Insights'}
          insights={insights.insightsPanel.insights}
          singleColumn={insights.insightsPanel.singleColumn}
        />
      ) : activeSubTab === 'market-insights' ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          No market insights published for this period yet.
        </div>
      ) : null}
    </div>
  )
}
