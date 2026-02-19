'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { RetailerConfigResponse } from '@/types'

interface AccountOptionsProps {
  retailerId: string
}

const TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
const METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']

export default function AccountOptions({ retailerId }: AccountOptionsProps) {
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [visibleTabs, setVisibleTabs] = useState<string[]>([])
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>([])
  const [keywordFilters, setKeywordFilters] = useState<string[]>([])
  const [featuresEnabled, setFeaturesEnabled] = useState<Record<string, boolean>>({})
  const [newKeyword, setNewKeyword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/config/${retailerId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch configuration.')
      }

      const config: RetailerConfigResponse = await response.json()
      setVisibleTabs(config.visible_tabs || TABS)
      setVisibleMetrics(config.visible_metrics || METRICS)
      setKeywordFilters(config.keyword_filters || [])
      setFeaturesEnabled(config.features_enabled || {})
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load configuration.')
    } finally {
      setLoading(false)
    }
  }, [retailerId])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  useEffect(() => {
    if (!toastMessage) return

    const timeout = window.setTimeout(() => setToastMessage(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toastMessage])

  const handleSave = async (section: string) => {
    if (visibleTabs.length === 0 || visibleMetrics.length === 0) {
      setValidationError('Please keep at least one tab and one metric visible.')
      return
    }

    setValidationError(null)
    setSavingSection(section)
    try {
      const response = await fetch(`/api/config/${retailerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visible_tabs: visibleTabs,
          visible_metrics: visibleMetrics,
          keyword_filters: keywordFilters,
          features_enabled: featuresEnabled,
        }),
      })

      if (!response.ok) {
        const errorResponse = await response.json().catch(() => ({ error: 'Unable to save configuration.' }))
        throw new Error(errorResponse.error || 'Unable to save configuration.')
      }

      setToastMessage('Settings saved successfully.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save configuration.')
    } finally {
      setSavingSection(null)
    }
  }

  const toggleTab = (tab: string) => {
    setVisibleTabs((prev) =>
      prev.includes(tab) ? prev.filter((item) => item !== tab) : [...prev, tab]
    )
  }

  const toggleMetric = (metric: string) => {
    setVisibleMetrics((prev) =>
      prev.includes(metric) ? prev.filter((item) => item !== metric) : [...prev, metric]
    )
  }

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim()
    if (!trimmed) return
    if (keywordFilters.includes(trimmed)) return

    setKeywordFilters((prev) => [...prev, trimmed])
    setNewKeyword('')
  }

  const handleRemoveKeyword = (keyword: string) => {
    setKeywordFilters((prev) => prev.filter((item) => item !== keyword))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[240px]">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" aria-label="Loading configuration" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={fetchConfig}
          className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Account Options</h2>
        <p className="text-sm text-gray-600">Control what the client can see in their dashboard.</p>
      </div>

      {validationError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Visible Tabs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TABS.map((tab) => (
              <label key={tab} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={visibleTabs.includes(tab)}
                  onChange={() => toggleTab(tab)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#1C1D1C]"
                />
                <span className="capitalize">{tab.replace('_', ' ')}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => handleSave('tabs')}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-[#1C1D1C] text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              disabled={savingSection === 'tabs'}
            >
              {savingSection === 'tabs' ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Visible Metrics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {METRICS.map((metric) => (
              <label key={metric} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={visibleMetrics.includes(metric)}
                  onChange={() => toggleMetric(metric)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#1C1D1C]"
                />
                <span className="capitalize">{metric.replace('_', ' ')}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => handleSave('metrics')}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-[#1C1D1C] text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              disabled={savingSection === 'metrics'}
            >
              {savingSection === 'metrics' ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Keyword Filters</h3>
          <div className="flex flex-wrap gap-2">
            {keywordFilters.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(keyword)}
                  className="text-gray-500 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
                  aria-label={`Remove ${keyword}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {keywordFilters.length === 0 && (
              <p className="text-sm text-gray-500">No keyword filters configured.</p>
            )}
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newKeyword}
              onChange={(event) => setNewKeyword(event.target.value)}
              placeholder="Add keyword"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
              aria-label="New keyword"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddKeyword()
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddKeyword}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => handleSave('keywords')}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-[#1C1D1C] text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              disabled={savingSection === 'keywords'}
            >
              {savingSection === 'keywords' ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </section>
      </div>

      {toastMessage && (
        <div
          className="fixed bottom-6 right-6 rounded-md bg-[#1C1D1C] px-4 py-2 text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}
