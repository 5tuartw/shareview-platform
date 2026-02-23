'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { SubTabNavigation } from '@/components/shared'
import type { RetailerConfigResponse, ReportSchedule, RetailerAccessTokenInfo, RetailerAccessTokenCreateResponse } from '@/types'

interface RetailerSettingsPanelProps {
  retailerId: string
  retailerName: string
}

interface PromptTemplate {
  page_type: string
  insight_type: string
  prompt_text: string
}

const VALID_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']
const DATA_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
const DATA_TAB_LABELS: Record<string, string> = {
  overview: 'Overview',
  keywords: 'Search Terms',
  categories: 'Categories',
  products: 'Products',
  auctions: 'Auctions',
}

export default function RetailerSettingsPanel({ retailerId, retailerName }: RetailerSettingsPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'scheduling' | 'access-link' | 'visibility'>('scheduling')
  const [activeVisibilityTab, setActiveVisibilityTab] = useState('overview')

  // Config state
  const [config, setConfig] = useState<RetailerConfigResponse | null>(null)
  const [visibleTabs, setVisibleTabs] = useState<string[]>([])
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>([])
  const [keywordFilters, setKeywordFilters] = useState<string[]>([])
  const [featuresEnabled, setFeaturesEnabled] = useState<Record<string, boolean>>({})

  // Schedule state
  const [schedule, setSchedule] = useState<ReportSchedule | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly',
    run_day: 1,
    report_period: 'previous_month',
    domains: ['overview', 'keywords', 'categories', 'products', 'auctions'],
    is_active: true,
  })

  // Access token state
  const [tokenInfo, setTokenInfo] = useState<RetailerAccessTokenInfo | null>(null)
  const [tokenForm, setTokenForm] = useState({
    expires_at: '',
    password: '',
    use_password: false,
  })
  const [newToken, setNewToken] = useState<RetailerAccessTokenCreateResponse | null>(null)

  // Prompt templates state
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([])

  // Keyword filter input
  const [keywordFilterInput, setKeywordFilterInput] = useState('')

  // Loading states
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load all data on mount
  useEffect(() => {
    loadData()
  }, [retailerId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [configRes, scheduleRes, tokenRes, promptsRes] = await Promise.all([
        fetch(`/api/config/${retailerId}`),
        fetch(`/api/retailers/${retailerId}/schedule`),
        fetch(`/api/retailers/${retailerId}/access-token`),
        fetch(`/api/insights/prompt-templates`),
      ])

      if (configRes.ok) {
        const configData: RetailerConfigResponse = await configRes.json()
        setConfig(configData)
        setVisibleTabs(configData.visible_tabs || [])
        setVisibleMetrics(configData.visible_metrics || [])
        setKeywordFilters(configData.keyword_filters || [])
        setFeaturesEnabled(configData.features_enabled || {})
      }

      if (scheduleRes.ok) {
        const scheduleData: ReportSchedule | null = await scheduleRes.json()
        if (scheduleData) {
          setSchedule(scheduleData)
          setScheduleForm({
            frequency: scheduleData.frequency,
            run_day: scheduleData.run_day ?? 1,
            report_period: scheduleData.report_period ?? 'previous_month',
            domains: scheduleData.domains || [],
            is_active: scheduleData.is_active,
          })
        }
      }

      if (tokenRes.ok) {
        const tokenData: RetailerAccessTokenInfo | null = await tokenRes.json()
        setTokenInfo(tokenData)
      }

      if (promptsRes.ok) {
        const promptsData: PromptTemplate[] = await promptsRes.json()
        setPromptTemplates(promptsData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setSavingConfig(true)
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
        throw new Error('Failed to save configuration')
      }

      const updated = await response.json()
      setConfig(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSavingConfig(false)
    }
  }

  const saveSchedule = async () => {
    try {
      setSavingSchedule(true)
      const response = await fetch(`/api/retailers/${retailerId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleForm),
      })

      if (!response.ok) {
        throw new Error('Failed to save schedule')
      }

      const updated = await response.json()
      setSchedule(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  const generateToken = async () => {
    try {
      setGeneratingToken(true)
      const response = await fetch(`/api/retailers/${retailerId}/access-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expires_at: tokenForm.expires_at || null,
          password: tokenForm.use_password ? tokenForm.password : null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate access token')
      }

      const result: RetailerAccessTokenCreateResponse = await response.json()
      setNewToken(result)

      // Reload token info
      const tokenRes = await fetch(`/api/retailers/${retailerId}/access-token`)
      if (tokenRes.ok) {
        const tokenData: RetailerAccessTokenInfo | null = await tokenRes.json()
        setTokenInfo(tokenData)
      }

      // Reset form
      setTokenForm({ expires_at: '', password: '', use_password: false })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate access token')
    } finally {
      setGeneratingToken(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => alert('Copied to clipboard!'),
      () => alert('Failed to copy to clipboard')
    )
  }

  const addKeywordFilters = () => {
    if (!keywordFilterInput.trim()) return
    const newFilters = keywordFilterInput
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f && !keywordFilters.includes(f))
    setKeywordFilters([...keywordFilters, ...newFilters])
    setKeywordFilterInput('')
  }

  const removeKeywordFilter = (filter: string) => {
    setKeywordFilters(keywordFilters.filter((f) => f !== filter))
  }

  const toggleVisibleTab = (tab: string) => {
    setVisibleTabs((prev) =>
      prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab]
    )
  }

  const toggleVisibleMetric = (metric: string) => {
    setVisibleMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Retailer Settings</h2>
        <p className="text-gray-500 text-sm mt-1">Configure scheduling, access, and visibility for {retailerName}</p>
      </div>

      <SubTabNavigation
        activeTab={activeSubTab}
        tabs={[
          { id: 'scheduling', label: 'Scheduling & access' },
          { id: 'access-link', label: 'Retailer access link' },
          { id: 'visibility', label: 'Visibility settings' },
        ]}
        onTabChange={(tab) => setActiveSubTab(tab as typeof activeSubTab)}
      />

      <div className="mt-6">
        {/* Scheduling & Access Tab */}
        {activeSubTab === 'scheduling' && (
          <div className="space-y-6">
            {/* Overall Visibility */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Visibility</h3>
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Retailer visibility enabled:</label>
                <select
                  value={featuresEnabled.retailer_visibility_enabled ? 'yes' : 'no'}
                  onChange={(e) =>
                    setFeaturesEnabled({ ...featuresEnabled, retailer_visibility_enabled: e.target.value === 'yes' })
                  }
                  className="px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            {/* Scheduling Form */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Scheduling</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                  <select
                    value={scheduleForm.frequency}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Run day (of month/week)</label>
                  <input
                    type="number"
                    value={scheduleForm.run_day}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, run_day: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Report period</label>
                  <input
                    type="text"
                    value={scheduleForm.report_period}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, report_period: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    placeholder="e.g., previous_month"
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleForm.is_active}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, is_active: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-gray-700">Schedule is active</span>
                  </label>
                </div>
              </div>
              <button
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md disabled:opacity-50"
              >
                {savingSchedule ? 'Saving...' : 'Save schedule'}
              </button>
            </div>

            {/* Approval & Release Rules */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Approval & Release Rules</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 min-w-[200px]">Include AI insights:</label>
                  <select
                    value={featuresEnabled.insights_enabled ? 'yes' : 'no'}
                    onChange={(e) =>
                      setFeaturesEnabled({ ...featuresEnabled, insights_enabled: e.target.value === 'yes' })
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 min-w-[200px]">Release report data:</label>
                  <select
                    value={featuresEnabled.data_auto_release ? 'yes' : 'no'}
                    onChange={(e) =>
                      setFeaturesEnabled({ ...featuresEnabled, data_auto_release: e.target.value === 'yes' })
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 min-w-[200px]">Release insights:</label>
                  <select
                    value={featuresEnabled.insights_auto_release ? 'yes' : 'no'}
                    onChange={(e) =>
                      setFeaturesEnabled({ ...featuresEnabled, insights_auto_release: e.target.value === 'yes' })
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save rules'}
              </button>
            </div>

            {/* AI Prompt (Read-only) */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Prompt Templates (Read-only)</h3>
              {promptTemplates.length === 0 ? (
                <p className="text-gray-500 text-sm">No prompt templates configured</p>
              ) : (
                <div className="space-y-4">
                  {promptTemplates.map((template, idx) => (
                    <div key={idx} className="border border-gray-200 rounded p-3">
                      <div className="text-sm font-medium text-gray-700 mb-1">
                        {template.page_type} › {template.insight_type}
                      </div>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-2 rounded">
                        {template.prompt_text}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Retailer Access Link Tab */}
        {activeSubTab === 'access-link' && (
          <div className="space-y-6">
            {/* Existing Token */}
            {tokenInfo && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Access Link</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tokenInfo.url}
                        readOnly
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-900"
                      />
                      <button
                        onClick={() => copyToClipboard(tokenInfo.url)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-md"
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>Created: {new Date(tokenInfo.created_at).toLocaleString()}</p>
                    {tokenInfo.expires_at && <p>Expires: {new Date(tokenInfo.expires_at).toLocaleString()}</p>}
                    {tokenInfo.has_password && <p className="text-amber-600">Password protected</p>}
                  </div>
                </div>
              </div>
            )}

            {/* New Token Display */}
            {newToken && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-900 mb-4">New Access Link Generated!</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-green-900 mb-1">URL (copy this now):</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newToken.url}
                        readOnly
                        className="flex-1 px-3 py-2 border border-green-300 rounded-md bg-white text-gray-900"
                      />
                      <button
                        onClick={() => copyToClipboard(newToken.url)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-green-800">
                    This is the only time the full URL will be displayed. Copy it now!
                  </p>
                </div>
              </div>
            )}

            {/* Generate Form */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {tokenInfo ? 'Regenerate Access Link' : 'Generate Access Link'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Expiry date (optional)</label>
                  <input
                    type="date"
                    value={tokenForm.expires_at}
                    onChange={(e) => setTokenForm({ ...tokenForm, expires_at: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tokenForm.use_password}
                      onChange={(e) => setTokenForm({ ...tokenForm, use_password: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-gray-700">Enable password protection</span>
                  </label>
                </div>
                {tokenForm.use_password && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <input
                      type="password"
                      value={tokenForm.password}
                      onChange={(e) => setTokenForm({ ...tokenForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    />
                  </div>
                )}
                <button
                  onClick={generateToken}
                  disabled={generatingToken}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md disabled:opacity-50"
                >
                  {generatingToken ? 'Generating...' : 'Generate new link'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Visibility Settings Tab */}
        {activeSubTab === 'visibility' && (
          <div className="space-y-6">
            <SubTabNavigation
              activeTab={activeVisibilityTab}
              tabs={DATA_TABS.map((tab) => ({ id: tab, label: DATA_TAB_LABELS[tab] }))}
              onTabChange={setActiveVisibilityTab}
            />

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {DATA_TAB_LABELS[activeVisibilityTab]} Settings
              </h3>

              {/* Show tab to retailer */}
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleTabs.includes(activeVisibilityTab)}
                    onChange={() => toggleVisibleTab(activeVisibilityTab)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700">Show this tab to retailer</span>
                </label>
              </div>

              {/* Visible Metric Cards */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Visible metric cards:</label>
                <div className="grid grid-cols-2 gap-3">
                  {VALID_METRICS.map((metric) => (
                    <label key={metric} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleMetrics.includes(metric)}
                        onChange={() => toggleVisibleMetric(metric)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">{metric.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Insights Enabled */}
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!featuresEnabled[`${activeVisibilityTab}_insights_enabled`]}
                    onChange={(e) =>
                      setFeaturesEnabled({
                        ...featuresEnabled,
                        [`${activeVisibilityTab}_insights_enabled`]: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700">Insights enabled for this tab</span>
                </label>
              </div>

              {/* Excluded Search Terms (keywords tab only) */}
              {activeVisibilityTab === 'keywords' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Excluded search terms:</label>
                  {keywordFilters.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {keywordFilters.map((filter) => (
                        <span
                          key={filter}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full border border-gray-300"
                        >
                          {filter}
                          <button
                            onClick={() => removeKeywordFilter(filter)}
                            className="hover:text-red-600"
                            aria-label="Remove filter"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={keywordFilterInput}
                      onChange={(e) => setKeywordFilterInput(e.target.value)}
                      placeholder="Enter comma-separated search terms to exclude"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                      rows={2}
                    />
                    <button
                      onClick={addKeywordFilters}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-md"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save visibility settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
