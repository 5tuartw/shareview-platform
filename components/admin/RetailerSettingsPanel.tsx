'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, ToggleLeft, ToggleRight, Copy } from 'lucide-react'
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
  const [activeSubTab, setActiveSubTab] = useState<'scheduling' | 'access-link' | 'visibility' | 'ai-prompts'>('scheduling')
  const [activeVisibilityTab, setActiveVisibilityTab] = useState('overview')

  // Config state
  const [config, setConfig] = useState<RetailerConfigResponse | null>(null)
  const [visibleTabs, setVisibleTabs] = useState<string[]>([])
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>([])
  const [keywordFilters, setKeywordFilters] = useState<string[]>([])
  const [featuresEnabled, setFeaturesEnabled] = useState<Record<string, boolean>>({})

  // Schedule state
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly',
    run_day: 1,
    starting_month: 1, // For quarterly only
    report_period_value: 1,
    report_period_unit: 'month' as 'week' | 'month' | 'quarter',
    lookback_value: 12,
    lookback_unit: 'weeks' as 'weeks' | 'months',
    domains: ['overview', 'keywords', 'categories', 'products', 'auctions'],
    is_active: true,
  })

  // Access control state
  const [canAccessShareView, setCanAccessShareView] = useState(false)
  const [enableReports, setEnableReports] = useState(false)
  const [enableLiveData, setEnableLiveData] = useState(false)

  // Access token state
  const [tokenInfo, setTokenInfo] = useState<RetailerAccessTokenInfo | null>(null)
  const [showGenerateLinkModal, setShowGenerateLinkModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
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
          // TODO: Implement loading existing schedules when backend supports multiple schedules
          // For now, we're working with UI-only implementation
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
      // TODO: Implement save schedule when backend supports multiple schedules
      // For now, just close the modal
      alert('Schedule save not yet implemented - UI only')
      setShowScheduleModal(false)
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
      
      // Copy the new URL to clipboard immediately
      await navigator.clipboard.writeText(result.url)

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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      alert('Failed to copy to clipboard')
    }
  }

  const deleteToken = async () => {
    try {
      const response = await fetch(`/api/retailers/${retailerId}/access-token`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to delete access token')
      }
      setTokenInfo(null)
      setNewToken(null)
      setShowDeleteConfirmModal(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete access token')
      setShowDeleteConfirmModal(false)
    }
  }

  const getDaysUntilExpiry = (expiryDate: string): number => {
    const expiry = new Date(expiryDate)
    const now = new Date()
    const diffTime = expiry.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
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
    <>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-7xl px-6 mx-auto">
          <h2 className="text-2xl font-semibold text-gray-900">Retailer Settings</h2>
          <p className="text-gray-500 text-sm mt-1">Configure scheduling, access, and visibility for {retailerName}</p>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto">
          <SubTabNavigation
            activeTab={activeSubTab}
            tabs={[
              { id: 'scheduling', label: 'Scheduling & access' },
              { id: 'access-link', label: 'Retailer access link' },
              { id: 'visibility', label: 'Visibility settings' },
              { id: 'ai-prompts', label: 'AI prompts' },
            ]}
            onTabChange={(tab) => setActiveSubTab(tab as typeof activeSubTab)}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Scheduling & Access Tab */}
        {activeSubTab === 'scheduling' && (
          <>
            {/* Access and Manually Generated Reports - Side by Side */}
            <div className="grid grid-cols-2 gap-6">
              {/* Access Panel */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Access</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">Retailer can access ShareView</label>
                    <button
                      onClick={() => {
                        const newValue = !canAccessShareView
                        setCanAccessShareView(newValue)
                        if (!newValue) {
                          setEnableReports(false)
                          setEnableLiveData(false)
                        }
                      }}
                      className="relative"
                    >
                      {canAccessShareView ? (
                        <ToggleRight className="w-10 h-6 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-10 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <div className="ml-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className={`text-sm font-medium ${!canAccessShareView ? 'text-gray-400' : 'text-gray-700'}`}>
                        Enable Reports
                      </label>
                      <button
                        onClick={() => setEnableReports(!enableReports)}
                        disabled={!canAccessShareView}
                        className="relative"
                      >
                        {enableReports ? (
                          <ToggleRight className={`w-10 h-6 ${!canAccessShareView ? 'text-gray-300' : 'text-green-600'}`} />
                        ) : (
                          <ToggleLeft className={`w-10 h-6 ${!canAccessShareView ? 'text-gray-300' : 'text-gray-400'}`} />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className={`text-sm font-medium ${!canAccessShareView ? 'text-gray-400' : 'text-gray-700'}`}>
                        Enable Live Data
                      </label>
                      <button
                        onClick={() => setEnableLiveData(!enableLiveData)}
                        disabled={!canAccessShareView}
                        className="relative"
                      >
                        {enableLiveData ? (
                          <ToggleRight className={`w-10 h-6 ${!canAccessShareView ? 'text-gray-300' : 'text-green-600'}`} />
                        ) : (
                          <ToggleLeft className={`w-10 h-6 ${!canAccessShareView ? 'text-gray-300' : 'text-gray-400'}`} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Retailer link section */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Retailer Link</h4>
                  
                  {tokenInfo ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => copyToClipboard(tokenInfo.url)}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          <Copy className="w-4 h-4" />
                          Copy URL
                        </button>
                        <span className="text-sm text-gray-600">
                          {tokenInfo.expires_at ? `Expires in ${getDaysUntilExpiry(tokenInfo.expires_at)} days` : 'Expires when deleted'}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowDeleteConfirmModal(true)}
                        title="Delete link"
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 italic mb-3">No active retailer link</p>
                      <button
                        onClick={() => setShowGenerateLinkModal(true)}
                        className="px-3 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-md"
                      >
                        Generate link
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Manually Generated Reports Panel */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Manually Generated Reports</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="data-requires-approval"
                      checked={featuresEnabled.data_requires_approval ?? true}
                      onChange={(e) =>
                        setFeaturesEnabled({ ...featuresEnabled, data_requires_approval: e.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <label htmlFor="data-requires-approval" className="text-sm font-medium text-gray-700">
                      Report data require approval
                    </label>
                  </div>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="include-ai-insights"
                      checked={featuresEnabled.include_ai_insights ?? false}
                      onChange={(e) =>
                        setFeaturesEnabled({ ...featuresEnabled, include_ai_insights: e.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <label htmlFor="include-ai-insights" className="text-sm font-medium text-gray-700">
                      Include AI insights
                    </label>
                  </div>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="insights-require-approval"
                      checked={featuresEnabled.insights_require_approval ?? true}
                      onChange={(e) =>
                        setFeaturesEnabled({ ...featuresEnabled, insights_require_approval: e.target.checked })
                      }
                      disabled={!featuresEnabled.include_ai_insights}
                      className="mt-0.5 h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <label
                      htmlFor="insights-require-approval"
                      className={`text-sm font-medium ${!featuresEnabled.include_ai_insights ? 'text-gray-400' : 'text-gray-700'}`}
                    >
                      AI insights require approval
                    </label>
                  </div>
                </div>
                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md disabled:opacity-50"
                >
                  {savingConfig ? 'Saving...' : 'Save settings'}
                </button>
              </div>
            </div>

            {/* Report Scheduling Panel */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Report Scheduling</h3>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add scheduled report
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Run Day</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Report Period</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Overview Lookback</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {schedules.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                          No scheduled reports yet
                        </td>
                      </tr>
                    ) : (
                      schedules.map((schedule, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 capitalize">{schedule.frequency}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{schedule.run_day}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{schedule.report_period || 'N/A'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">N/A</td>
                          <td className="px-4 py-3">
                            <button
                              className="relative"
                              title={schedule.is_active ? 'Active' : 'Inactive'}
                            >
                              {schedule.is_active ? (
                                <ToggleRight className="w-8 h-5 text-green-600" />
                              ) : (
                                <ToggleLeft className="w-8 h-5 text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              title="Delete schedule"
                              className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* AI Prompts Tab */}
        {activeSubTab === 'ai-prompts' && (
          <>
            {/* AI Prompt Templates (Read-only) */}
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
          </>
        )}

        {/* Retailer Access Link Tab */}
        {activeSubTab === 'access-link' && (
          <>
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
                    {tokenInfo.expires_at && <p>Expires in {getDaysUntilExpiry(tokenInfo.expires_at)} days</p>}
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
          </>
        )}

        {/* Visibility Settings Tab */}
        {activeSubTab === 'visibility' && (
          <>
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
          </>
        )}
      </div>

      {/* Add Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowScheduleModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Scheduled Report</h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                <div className="flex gap-4">
                  {(['weekly', 'monthly', 'quarterly'] as const).map((freq) => (
                    <label key={freq} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="frequency"
                        value={freq}
                        checked={scheduleForm.frequency === freq}
                        onChange={(e) => {
                          setScheduleForm({
                            ...scheduleForm,
                            frequency: e.target.value as any,
                            lookback_unit: freq === 'quarterly' ? 'months' : 'weeks',
                            report_period_unit: freq === 'weekly' ? 'week' : freq === 'monthly' ? 'month' : 'quarter'
                          })
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700 capitalize">{freq}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Run Day */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Run Day</label>
                <select
                  value={scheduleForm.run_day}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, run_day: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                >
                  {scheduleForm.frequency === 'weekly' ? (
                    <>
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                      <option value={7}>Sunday</option>
                    </>
                  ) : (
                    Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))
                  )}
                </select>
                {scheduleForm.frequency !== 'weekly' && (
                  <p className="mt-1 text-xs text-gray-500">
                    If a month has fewer days, the report will run on the last day of that month
                  </p>
                )}
              </div>

              {/* Starting Month (Quarterly only) */}
              {scheduleForm.frequency === 'quarterly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Starting Month</label>
                  <select
                    value={scheduleForm.starting_month}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, starting_month: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value={1}>January</option>
                    <option value={2}>February</option>
                    <option value={3}>March</option>
                    <option value={4}>April</option>
                    <option value={5}>May</option>
                    <option value={6}>June</option>
                    <option value={7}>July</option>
                    <option value={8}>August</option>
                    <option value={9}>September</option>
                    <option value={10}>October</option>
                    <option value={11}>November</option>
                    <option value={12}>December</option>
                  </select>
                </div>
              )}

              {/* Report Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Period</label>
                <div className="flex gap-2">
                  <span className="flex items-center text-sm text-gray-700">Previous</span>
                  <input
                    type="number"
                    min="1"
                    value={scheduleForm.report_period_value}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, report_period_value: parseInt(e.target.value) || 1 })}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  />
                  <select
                    value={scheduleForm.report_period_unit}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, report_period_unit: e.target.value as any })}
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value="week">Week{scheduleForm.report_period_value !== 1 ? 's' : ''}</option>
                    <option value="month">Month{scheduleForm.report_period_value !== 1 ? 's' : ''}</option>
                    <option value="quarter">Quarter{scheduleForm.report_period_value !== 1 ? 's' : ''}</option>
                  </select>
                </div>
              </div>

              {/* Overview Lookback Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Overview Lookback Period</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={scheduleForm.lookback_value}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, lookback_value: parseInt(e.target.value) || 12 })}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  />
                  <select
                    value={scheduleForm.lookback_unit}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, lookback_unit: e.target.value as any })}
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value="weeks">Week{scheduleForm.lookback_value !== 1 ? 's' : ''}</option>
                    <option value="months">Month{scheduleForm.lookback_value !== 1 ? 's' : ''}</option>
                  </select>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Default: 12 weeks for weekly/monthly schedules, 12 months for quarterly schedules
                </p>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Schedule is active</label>
                <button
                  onClick={() => setScheduleForm({ ...scheduleForm, is_active: !scheduleForm.is_active })}
                  className="relative"
                >
                  {scheduleForm.is_active ? (
                    <ToggleRight className="w-10 h-6 text-green-600" />
                  ) : (
                    <ToggleLeft className="w-10 h-6 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // TODO: Save schedule logic will be implemented in backend phase
                  console.log('Schedule to save:', scheduleForm)
                  setShowScheduleModal(false)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-md"
              >
                Add Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Link Modal */}
      {showGenerateLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowGenerateLinkModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Generate Retailer Link</h3>
              <button onClick={() => setShowGenerateLinkModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiry date (optional)
                </label>
                <input
                  type="date"
                  value={tokenForm.expires_at}
                  onChange={(e) => setTokenForm({ ...tokenForm, expires_at: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  min={new Date().toISOString().split('T')[0]}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank for no expiry (link will only expire when deleted)
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGenerateLinkModal(false)
                  setTokenForm({ expires_at: '', password: '', use_password: false })
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  generateToken()
                  setShowGenerateLinkModal(false)
                }}
                disabled={generatingToken}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-md disabled:opacity-50"
              >
                {generatingToken ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteConfirmModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Delete Retailer Link</h3>
              <button onClick={() => setShowDeleteConfirmModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this access link? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirmModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteToken}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
