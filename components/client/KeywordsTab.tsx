'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCcw, Trophy, AlertTriangle, Sparkles, XCircle, Filter } from 'lucide-react'
import { PageHeadline, QuickStatsBar, InsightsPanel } from '@/components/shared'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import SearchTermsSubTabs from '@/components/client/SearchTermsSubTabs'
import KeywordPerformanceTable from '@/components/client/KeywordPerformanceTable'
import WordAnalysis from '@/components/client/WordAnalysis'
import type { PageInsightsResponse } from '@/types'

interface KeywordsTabProps {
  retailerId: string
  apiBase?: string
  retailerConfig?: { insights?: boolean; market_insights?: boolean; word_analysis?: boolean }
  visibleMetrics?: string[]
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
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

export default function KeywordsTab({ retailerId, apiBase, retailerConfig, visibleMetrics }: KeywordsTabProps) {
  const { period, periodType, start, end } = useDateRange()
  const [activeSubTab, setActiveSubTab] = useState('performance')
  const [selectedQuadrant, setSelectedQuadrant] = useState<'winners' | 'css_wins_retailer_loses' | 'hidden_gems' | 'poor_performers'>('winners')
  const [keywordsData, setKeywordsData] = useState<KeywordsResponse | null>(null)
  const [insights, setInsights] = useState<PageInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const features = retailerConfig || { insights: true, market_insights: true, word_analysis: true }
  const allowedTabs = useMemo(() => {
    return [
      'performance',
      ...(features.word_analysis !== false ? ['word-analysis'] : []),
      ...(features.market_insights !== false ? ['market-comparison'] : []),
      ...(features.insights !== false ? ['insights'] : []),
    ]
  }, [features.insights, features.market_insights, features.word_analysis])

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
    const base = apiBase ?? '/api'
    const response = await fetch(
      `${base}/page-insights?retailerId=${retailerId}&pageType=search-terms&tab=${tab}&period=${period}`
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
        fetch(`${apiBase ?? '/api'}/retailers/${retailerId}/keywords?period=${period}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetchInsights(activeSubTab === 'market-comparison' ? 'market-insights' : activeSubTab),
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
    <div className="space-y-5">
      <SearchTermsSubTabs
        activeSubTab={activeSubTab}
        onSubTabChange={setActiveSubTab}
        retailerConfig={features}
      />

      {activeSubTab === 'performance' && (
        <>
          {keywordsData.metricCards && keywordsData.metricCards.length > 0 && (() => {
            const labelToKey: Record<string, string> = {
              'Conversion Rate': 'cvr',
              'Click-through Rate': 'ctr',
            }
            const visibleCards = (keywordsData.metricCards || []).filter(card => {
              if (!visibleMetrics?.length) return true
              const key = labelToKey[card.label]
              return !key || visibleMetrics.includes(key)
            })
            if (!visibleCards.length) return null
            return (
              <QuickStatsBar
                items={visibleCards.map(card => ({
                  label: card.label,
                  value: typeof card.value === 'number' ? String(card.value) : card.value,
                  change: card.change ?? undefined,
                  subtitle: card.subtitle,
                }))}
              />
            )
          })()}

          {keywordsData.quadrants && (() => {
            const quadrants = [
              { key: 'winners' as const, label: 'High CTR & High Conversions', icon: Trophy, color: '#2563EB' },
              { key: 'hidden_gems' as const, label: 'Low CTR, High Conversions', icon: Sparkles, color: '#14B8A6' },
              { key: 'css_wins_retailer_loses' as const, label: 'High CTR, Low Conversions', icon: AlertTriangle, color: '#F97316' },
              { key: 'poor_performers' as const, label: 'Low CTR, Low Conversions', icon: XCircle, color: '#DC2626' },
            ]
            return (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Filter by group:</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {quadrants.map(({ key, label, icon: Icon, color }) => {
                      const isActive = selectedQuadrant === key
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedQuadrant(key)}
                          className="px-3 py-1.5 text-sm font-semibold rounded-full border-2 transition-all hover:shadow-md flex items-center gap-1.5"
                          style={isActive ? {
                            backgroundColor: color,
                            borderColor: color,
                            color: 'white',
                          } : {
                            backgroundColor: 'white',
                            borderColor: color,
                            color: color,
                          }}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {label} ({keywordsData.quadrants![key].length})
                        </button>
                      )
                    })})
                  </div>
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
            )
          })()}
        </>
      )}

      {activeSubTab === 'word-analysis' && <WordAnalysis retailerId={retailerId} />}

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

      {activeSubTab === 'market-comparison' && insights?.insightsPanel ? (
        <InsightsPanel
          title={insights.insightsPanel.title || 'Market Insights'}
          insights={insights.insightsPanel.insights}
          singleColumn={insights.insightsPanel.singleColumn}
        />
      ) : activeSubTab === 'market-comparison' ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          No market insights published for this period yet.
        </div>
      ) : null}
    </div>
  )
}
