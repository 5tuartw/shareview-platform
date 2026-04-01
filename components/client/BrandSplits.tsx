'use client'

import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import { PerformanceTable, type Column } from '@/components/shared'
import {
  fetchKeywordBrandSplits,
  type KeywordBrandSplitsResponse,
  type KeywordBrandSplitScope,
  type KeywordBrandSplitClassification,
} from '@/lib/api-client'

interface BrandSplitsProps {
  retailerId: string
  apiBase?: string
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
  classificationOverride?: Partial<Record<KeywordBrandSplitClassification, 'default' | 'show' | 'hide'>>
}

type ScopeOption = {
  key: KeywordBrandSplitScope
  label: string
  description: string
}

type ClassificationFilter = 'all' | KeywordBrandSplitClassification

type ScopeSummaryData = Pick<
  KeywordBrandSplitsResponse,
  'scope' | 'summary' | 'matched_vocab_count' | 'matched_phrases' | 'disclaimer' | 'period' | 'total_conversions' | 'total_search_terms'
>

type BrandSplitSummaryBucket = {
  search_terms: number
  impressions: number
  clicks: number
  conversions: number
  share_of_total_conversions_pct: number
}

type BrandSplitRow = KeywordBrandSplitsResponse['terms'][number] & {
  rank: number
  matched_brand_labels_text: string
}

const SCOPE_OPTIONS: ScopeOption[] = [
  {
    key: 'retailer',
    label: "retailer's name",
    description: 'Splitting search terms containing the brand as retailer\'s name:',
  },
  {
    key: 'retailer_and_owned',
    label: 'retailer-owned brands',
    description: 'Splitting search terms containing the brand as retailer-owned brands:',
  },
  {
    key: 'retailer_owned_and_stocked',
    label: 'linked brands',
    description: 'Splitting search terms containing the brand as linked brands:',
  },
]

const CLASSIFICATION_META: Record<KeywordBrandSplitClassification, { label: string; color: string; tooltip: string }> = {
  generic: {
    label: 'Generic term',
    color: '#F59E0B',
    tooltip: 'No retailer-linked brand phrase was detected in the search term.',
  },
  brand_and_term: {
    label: 'Brand + term',
    color: '#2563EB',
    tooltip: 'A retailer-linked brand phrase was present alongside non-brand wording.',
  },
  brand_only: {
    label: 'Brand only',
    color: '#14B8A6',
    tooltip: 'The search term normalised down to retailer-linked brand wording only.',
  },
}

const CARD_ORDER: KeywordBrandSplitClassification[] = ['brand_only', 'brand_and_term', 'generic']
const ROLLOUT_SCOPE_OPTIONS: ScopeOption[] = SCOPE_OPTIONS.filter((option) => option.key === 'retailer')

const formatNumber = (value: number | null | undefined, maximumFractionDigits = 0) => {
  if (value == null) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits })
}

const formatPercent = (value: number | null | undefined, digits = 1) => {
  if (value == null) return '0.0%'
  return `${value.toFixed(digits)}%`
}

function getSummaryBucket(summary: Record<string, unknown>, key: KeywordBrandSplitClassification): BrandSplitSummaryBucket {
  const raw = summary[key]
  if (!raw || typeof raw !== 'object') {
    return {
      search_terms: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      share_of_total_conversions_pct: 0,
    }
  }

  const bucket = raw as Record<string, number>
  return {
    search_terms: Number(bucket.search_terms || 0),
    impressions: Number(bucket.impressions || 0),
    clicks: Number(bucket.clicks || 0),
    conversions: Number(bucket.conversions || 0),
    share_of_total_conversions_pct: Number(bucket.share_of_total_conversions_pct || 0),
  }
}

function summariesAreEquivalent(
  left: ScopeSummaryData | undefined,
  right: ScopeSummaryData | undefined,
): boolean {
  if (!left || !right) return false

  if (Number(left.total_search_terms || 0) !== Number(right.total_search_terms || 0)) return false
  if (Number(left.total_conversions || 0) !== Number(right.total_conversions || 0)) return false

  return (['generic', 'brand_and_term', 'brand_only'] as KeywordBrandSplitClassification[]).every((key) => {
    const leftBucket = getSummaryBucket(left.summary, key)
    const rightBucket = getSummaryBucket(right.summary, key)

    return (
      leftBucket.search_terms === rightBucket.search_terms &&
      leftBucket.impressions === rightBucket.impressions &&
      leftBucket.clicks === rightBucket.clicks &&
      leftBucket.conversions === rightBucket.conversions &&
      leftBucket.share_of_total_conversions_pct === rightBucket.share_of_total_conversions_pct
    )
  })
}

export default function BrandSplits({ retailerId, apiBase, reportId, reportPeriod, classificationOverride }: BrandSplitsProps) {
  const { period } = useDateRange()
  const [scope, setScope] = useState<KeywordBrandSplitScope>('retailer')
  const [classification, setClassification] = useState<ClassificationFilter>('all')
  const [scopeData, setScopeData] = useState<Partial<Record<KeywordBrandSplitScope, ScopeSummaryData>>>({})
  const [detailData, setDetailData] = useState<KeywordBrandSplitsResponse | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedScopes, setExpandedScopes] = useState<Record<string, boolean>>({})

  const activeClassifications = useMemo(() => {
    const hasExplicitShow = CARD_ORDER.some((key) => classificationOverride?.[key] === 'show')
    if (hasExplicitShow) {
      return CARD_ORDER.filter((key) => classificationOverride?.[key] === 'show')
    }

    return CARD_ORDER.filter((key) => classificationOverride?.[key] !== 'hide')
  }, [classificationOverride])

  const requestedPeriod = useMemo(() => {
    if (reportPeriod?.start) {
      return reportPeriod.start.slice(0, 7)
    }

    return period
  }, [period, reportPeriod?.start])

  useEffect(() => {
    const fetchSummaryData = async () => {
      setLoadingSummary(true)

      const results = await Promise.allSettled(
        ROLLOUT_SCOPE_OPTIONS.map(async (option) => {
          const result = await fetchKeywordBrandSplits(retailerId, {
            apiBase,
            period: requestedPeriod,
            scope: option.key,
            classification: 'all',
            limit: 1,
          })

          return [option.key, result] as const
        })
      )

      const nextScopeData: Partial<Record<KeywordBrandSplitScope, ScopeSummaryData>> = {}

      for (const result of results) {
        if (result.status !== 'fulfilled') continue
        const [key, value] = result.value
        nextScopeData[key] = value
      }

      if (Object.keys(nextScopeData).length === 0) {
        throw new Error('No Brand Splits data available for this period.')
      }

      setScopeData(nextScopeData)
      setError(null)
      setLoadingSummary(false)
    }

    fetchSummaryData().catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch Brand Splits')
      setScopeData({})
      setLoadingSummary(false)
    })
  }, [apiBase, requestedPeriod, retailerId])

  const visibleScopeOptions = useMemo(() => {
    const retailerSummary = scopeData.retailer
    const ownedSummary = scopeData.retailer_and_owned
    const linkedSummary = scopeData.retailer_owned_and_stocked

    return ROLLOUT_SCOPE_OPTIONS.filter((option) => {
      if (option.key === 'retailer') return Boolean(retailerSummary)
      if (option.key === 'retailer_and_owned') {
        return Boolean(ownedSummary) && !summariesAreEquivalent(retailerSummary, ownedSummary)
      }

      return Boolean(linkedSummary) && !summariesAreEquivalent(ownedSummary ?? retailerSummary, linkedSummary)
    })
  }, [scopeData])

  useEffect(() => {
    if (visibleScopeOptions.length === 0) return
    if (!visibleScopeOptions.some((option) => option.key === scope)) {
      setScope(visibleScopeOptions[0].key)
    }
  }, [scope, visibleScopeOptions])

  useEffect(() => {
    if (classification === 'all') return
    if (activeClassifications.includes(classification)) return
    setClassification('all')
  }, [activeClassifications, classification])

  const activeScopeSummary = scopeData[scope]

  useEffect(() => {
    if (visibleScopeOptions.length === 0) return
    if (!activeScopeSummary) return

    const fetchDetailData = async () => {
      try {
        setLoadingDetail(true)
        const result = await fetchKeywordBrandSplits(retailerId, {
          apiBase,
          period: requestedPeriod,
          scope,
          classification,
          limit: classification === 'all' ? 200 : 100,
        })

        setDetailData(result)
        setError(null)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch Brand Splits')
        setDetailData(null)
      } finally {
        setLoadingDetail(false)
      }
    }

    fetchDetailData()
  }, [activeScopeSummary, apiBase, classification, requestedPeriod, retailerId, scope, visibleScopeOptions])

  const activeScopeBuckets = useMemo(() => {
    const summary = activeScopeSummary?.summary || {}
    return {
      generic: getSummaryBucket(summary, 'generic'),
      brand_and_term: getSummaryBucket(summary, 'brand_and_term'),
      brand_only: getSummaryBucket(summary, 'brand_only'),
    }
  }, [activeScopeSummary])

  const toggleScopeExpansion = (scopeKey: KeywordBrandSplitScope) => {
    setExpandedScopes((current) => ({
      ...current,
      [scopeKey]: !current[scopeKey],
    }))
  }

  const tableData = useMemo<BrandSplitRow[]>(() => {
    return (detailData?.terms || [])
      .filter((row) => classification === 'all' ? activeClassifications.includes(row.classification) : true)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        matched_brand_labels_text: (row.matched_brand_labels || []).join(', '),
      }))
  }, [activeClassifications, classification, detailData])

  const filters = useMemo(() => {
    return [
      {
        key: 'all',
        label: 'All splits',
        count: activeClassifications.reduce((total, key) => total + activeScopeBuckets[key].search_terms, 0),
        countLabel: 'Top 200',
        tooltip: 'Show the saved top terms across all split types for this brand selection.',
      },
      ...activeClassifications.map((key) => ({
        key,
        label: CLASSIFICATION_META[key].label,
        count: activeScopeBuckets[key].search_terms,
        countLabel: 'Top 100',
        color: CLASSIFICATION_META[key].color,
        tooltip: CLASSIFICATION_META[key].tooltip,
      })),
    ]
  }, [activeClassifications, activeScopeBuckets])

  const columns: Column<BrandSplitRow>[] = [
    {
      key: 'rank',
      label: '#',
      align: 'left',
    },
    {
      key: 'search_term',
      label: 'Search Term',
      sortable: true,
      render: (row) => (
        <div className="min-w-[240px]">
          <div className="font-medium text-gray-900">{row.search_term || 'Unlabelled term'}</div>
          <div className="mt-1 text-xs text-gray-500">{row.normalized_search_term || 'Normalises to blank'}</div>
        </div>
      ),
    },
    {
      key: 'classification',
      label: 'Split',
      sortable: true,
      render: (row) => (
        <span
          className="inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold"
          style={{
            color: CLASSIFICATION_META[row.classification].color,
            borderColor: `${CLASSIFICATION_META[row.classification].color}33`,
            backgroundColor: `${CLASSIFICATION_META[row.classification].color}14`,
          }}
        >
          {CLASSIFICATION_META[row.classification].label}
        </span>
      ),
    },
    {
      key: 'matched_brand_labels_text',
      label: 'Matched labels',
      sortable: true,
      render: (row) => row.matched_brand_labels_text || 'None',
    },
    {
      key: 'total_clicks',
      label: 'Clicks',
      sortable: true,
      align: 'right',
      format: 'number',
    },
    {
      key: 'ctr',
      label: 'CTR',
      align: 'right',
      sortable: true,
      render: (row) => row.ctr != null ? `${Number(row.ctr).toFixed(1)}%` : '-',
    },
    {
      key: 'total_conversions',
      label: 'Conversions',
      sortable: true,
      align: 'right',
      render: (row) => formatNumber(Number(row.total_conversions || 0), 2),
    },
    {
      key: 'cvr',
      label: 'CVR',
      align: 'right',
      sortable: true,
      render: (row) => row.cvr != null ? `${Number(row.cvr).toFixed(1)}%` : '-',
    },
    {
      key: 'share_of_total_conversions_pct',
      label: 'Share of inferred conversions',
      sortable: true,
      align: 'right',
      format: 'percent',
      tooltip: 'This share is based on attributed Google Ads conversions, not confirmed product-level sales.',
    },
  ]

  if (loadingSummary) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600">Loading Brand Splits...</span>
        </div>
      </div>
    )
  }

  if (error || visibleScopeOptions.length === 0 || !activeScopeSummary) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start gap-3 text-amber-600">
          <Info className="mt-0.5 h-5 w-5" />
          <div>
            <h3 className="font-semibold">Brand Splits unavailable</h3>
            <p className="mt-1 text-sm text-gray-600">{error || 'No Brand Splits data available for this period.'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <p>Google Ads attributes conversion to a search term when it appears in one step of the buyer's journey prior to making any purchase, regardless of whether it was related to that search term.</p>
          </div>
        </div>
      </div>

      {!reportId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Admin notice:</span> Manage retailer aliases and linked brands in{' '}
          <Link href="/dashboard/manage-retailers" className="font-medium underline hover:text-amber-900">
            Retailer Management
          </Link>
          . The data will be updated in the next daily refresh. This message does not appear on the retailer&apos;s view.
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Conversions split by brand name presence in search terms</h2>
        </div>

        <div className="space-y-3">
          {visibleScopeOptions.map((option) => {
            const summary = scopeData[option.key]
            if (!summary) return null
            const phrases = Array.from(new Set(summary.matched_phrases || []))
            const isExpanded = expandedScopes[option.key] === true
            const visiblePhrases = isExpanded ? phrases : phrases.slice(0, 5)
            const hiddenCount = Math.max(phrases.length - visiblePhrases.length, 0)

            const active = option.key === scope
            const buckets = {
              generic: getSummaryBucket(summary.summary, 'generic'),
              brand_and_term: getSummaryBucket(summary.summary, 'brand_and_term'),
              brand_only: getSummaryBucket(summary.summary, 'brand_only'),
            }

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setScope(option.key)}
                className={`grid w-full gap-4 rounded-lg border p-4 text-left transition-colors lg:grid-cols-[260px_minmax(0,1fr)] ${active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <div>
                  <div className="text-sm text-gray-700">
                    {option.description} <span className="font-semibold text-gray-900">{option.label}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    {visiblePhrases.map((phrase) => (
                      <span key={`${option.key}-${phrase}`} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1">
                        {phrase}
                      </span>
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleScopeExpansion(option.key)
                        }}
                      >
                        +{hiddenCount} more &gt;&gt;
                      </button>
                    )}
                    {isExpanded && phrases.length > 5 && (
                      <button
                        type="button"
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleScopeExpansion(option.key)
                        }}
                      >
                        Show less
                      </button>
                    )}
                  </div>
                </div>

                <div className={`grid gap-3 ${activeClassifications.length > 1 ? 'md:grid-cols-3' : 'md:grid-cols-1'}`}>
                  {activeClassifications.map((key) => {
                    const bucket = buckets[key]
                    return (
                      <div key={key} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold" style={{ color: CLASSIFICATION_META[key].color }}>
                            {CLASSIFICATION_META[key].label}
                          </span>
                          <span className="text-sm text-gray-600">{formatPercent(bucket.share_of_total_conversions_pct)}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(bucket.share_of_total_conversions_pct, 2)}%`,
                              backgroundColor: CLASSIFICATION_META[key].color,
                            }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          {formatNumber(bucket.search_terms)} terms · {formatNumber(bucket.conversions, 2)} conversions
                        </div>
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {loadingDetail ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600">Loading Brand Splits detail...</span>
          </div>
        </div>
      ) : (
        <PerformanceTable
          key={`${scope}-${classification}`}
          data={tableData}
          columns={columns}
          filters={filters}
          defaultFilter={classification}
          onFilterChange={(value) => setClassification(value as ClassificationFilter)}
          defaultSort={{ key: 'total_conversions', direction: 'desc' }}
          pageSize={50}
        />
      )}
    </div>
  )
}