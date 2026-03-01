'use client'

import { useState, useEffect, useRef } from 'react'
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

const OVERVIEW_METRICS = [
  { id: 'gmv_graph', label: 'GMV Graph' },
  { id: 'conversions_graph', label: 'Conversions Graph' },
  { id: 'roi_graph', label: 'ROI Graph' },
  { id: 'validation_rate_graph', label: 'Validation Rate Graph' },
]

const KEYWORDS_METRICS = [
  { id: 'total_keywords', label: 'Total Search Terms' },
  { id: 'top_keywords', label: 'Top Search Terms' },
  { id: 'conversion_rate', label: 'Conversion Rate' },
  { id: 'click_through_rate', label: 'Click-through Rate' },
]

const CATEGORIES_METRICS = [
  { id: 'total_categories', label: 'Total Categories' },
  { id: 'total_impressions', label: 'Total Impressions' },
  { id: 'total_clicks', label: 'Total Clicks' },
  { id: 'total_conversions', label: 'Total Conversions' },
  { id: 'overall_ctr', label: 'Overall CTR' },
  { id: 'overall_cvr', label: 'Overall CVR' },
]

const PRODUCTS_METRICS = [
  { id: 'total_products', label: 'Total Products' },
  { id: 'products_with_conversions', label: 'Products with Conversions' },
  { id: 'zero_cvr_products', label: '0% Product CVR' },
  { id: 'non_converting_clicks', label: 'Total Non-converting Clicks' },
]

export default function RetailerSettingsPanel({ retailerId, retailerName }: RetailerSettingsPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'scheduling' | 'visibility' | 'ai-prompts' | 'domain-customisation'>('scheduling')
  const saveVisibilityButtonRef = useRef<HTMLButtonElement>(null)
  const [showStickyBar, setShowStickyBar] = useState(false)

  useEffect(() => {
    if (activeSubTab !== 'visibility') {
      setShowStickyBar(false)
      return
    }
    const el = saveVisibilityButtonRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [activeSubTab])

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

  // Visibility grid state
  const [tabsEnabled, setTabsEnabled] = useState<Record<string, boolean>>({})
  const [tabMarketComparisonEnabled, setTabMarketComparisonEnabled] = useState<Record<string, boolean>>({})
  const [tabInsightsEnabled, setTabInsightsEnabled] = useState<Record<string, boolean>>({})
  const [tabWordAnalysisEnabled, setTabWordAnalysisEnabled] = useState<Record<string, boolean>>({})
  const [tabMetricsEnabled, setTabMetricsEnabled] = useState<Record<string, boolean>>({})
  const [tabPerformanceTableEnabled, setTabPerformanceTableEnabled] = useState<Record<string, boolean>>({})
  const [selectedTabMetrics, setSelectedTabMetrics] = useState<Record<string, string[]>>({})

  // Access token state
  const [tokenInfo, setTokenInfo] = useState<RetailerAccessTokenInfo | null>(null)
  const [reportTokenInfo, setReportTokenInfo] = useState<RetailerAccessTokenInfo | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedReportToken, setCopiedReportToken] = useState(false)
  const [pendingTokenType, setPendingTokenType] = useState<'live_data' | 'report_access'>('live_data')
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

  // Domain customisation state
  const [categoryTrimmingEnabled, setCategoryTrimmingEnabled] = useState(true)
  const [benchmarkInfo, setBenchmarkInfo] = useState<{
    period: string | null
    benchmark_strategy: 'all' | 'top-85%'
    total_scorable_nodes: number
    benchmark_node_count: number
    benchmark_impression_pct: number | null
    trimming_enabled: boolean
    total_trimmed: number
    trimmed_categories: { full_path: string; node_impressions: number; node_ctr: number | null; health_status_node: string | null }[]
  } | null>(null)
  const [showAllTrimmed, setShowAllTrimmed] = useState(false)
  const [savingDomainSettings, setSavingDomainSettings] = useState(false)
  const [loadingDomainSettings, setLoadingDomainSettings] = useState(false)

  // Keyword filter textarea
  const [keywordTextareaValue, setKeywordTextareaValue] = useState('')
  const [savingKeywordFilters, setSavingKeywordFilters] = useState(false)
  const [keywordFilterSaveStatus, setKeywordFilterSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

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

  // Load domain settings when that sub-tab is activated
  useEffect(() => {
    if (activeSubTab !== 'domain-customisation') return
    const loadDomainSettings = async () => {
      setLoadingDomainSettings(true)
      setShowAllTrimmed(false)
      try {
        const [settingsRes, benchmarkRes] = await Promise.all([
          fetch(`/api/retailers/${retailerId}/domain-settings`),
          fetch(`/api/retailers/${retailerId}/categories/benchmark`),
        ])
        if (settingsRes.ok) {
          const data = await settingsRes.json()
          setCategoryTrimmingEnabled(data.categories_trimming_enabled ?? true)
        }
        if (benchmarkRes.ok) {
          const data = await benchmarkRes.json()
          setBenchmarkInfo(data)
        }
      } catch {
        // non-critical — UI shows defaults
      } finally {
        setLoadingDomainSettings(false)
      }
    }
    loadDomainSettings()
  }, [activeSubTab, retailerId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [configRes, scheduleRes, tokenRes, reportTokenRes, promptsRes] = await Promise.all([
        fetch(`/api/config/${retailerId}`),
        fetch(`/api/retailers/${retailerId}/schedule`),
        fetch(`/api/retailers/${retailerId}/access-token?type=live_data`),
        fetch(`/api/retailers/${retailerId}/access-token?type=report_access`),
        fetch(`/api/insights/prompt-templates`),
      ])

      if (configRes.ok) {
        const configData: RetailerConfigResponse = await configRes.json()
        setConfig(configData)
        setVisibleTabs(configData.visible_tabs || [])
        setVisibleMetrics(configData.visible_metrics || [])
        setKeywordFilters(configData.keyword_filters || [])
        setKeywordTextareaValue((configData.keyword_filters || []).join('\n'))
        setFeaturesEnabled(configData.features_enabled || {})
        
        // Load access control settings from features_enabled
        setCanAccessShareView(configData.features_enabled?.can_access_shareview ?? false)
        setEnableReports(configData.features_enabled?.enable_reports ?? false)
        setEnableLiveData(configData.features_enabled?.enable_live_data ?? false)
        
        // Load visibility grid settings
        const features = configData.features_enabled || {}
        const tabsEn: Record<string, boolean> = {}
        const marketCompEn: Record<string, boolean> = {}
        const insightsEn: Record<string, boolean> = {}
        const wordAnalysisEn: Record<string, boolean> = {}
        const metricsEn: Record<string, boolean> = {}
        const perfTableEn: Record<string, boolean> = {}
        const selectedMetrics: Record<string, string[]> = {}
        
        DATA_TABS.forEach(tab => {
          tabsEn[tab] = features[`${tab}_enabled`] ?? true
          marketCompEn[tab] = features[`${tab}_market_comparison_enabled`] ?? true
          insightsEn[tab] = features[`${tab}_insights_enabled`] ?? true
          wordAnalysisEn[tab] = features[`${tab}_word_analysis_enabled`] ?? (tab === 'keywords' ? false : true)
          metricsEn[tab] = features[`${tab}_metrics_enabled`] ?? true
          perfTableEn[tab] = features[`${tab}_performance_table_enabled`] ?? true
          const savedMetrics = features[`${tab}_selected_metrics`]
          selectedMetrics[tab] = Array.isArray(savedMetrics) ? savedMetrics : []
        })
        
        setTabsEnabled(tabsEn)
        setTabMarketComparisonEnabled(marketCompEn)
        setTabInsightsEnabled(insightsEn)
        setTabWordAnalysisEnabled(wordAnalysisEn)
        setTabMetricsEnabled(metricsEn)
        setTabPerformanceTableEnabled(perfTableEn)
        setSelectedTabMetrics(selectedMetrics)
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

      if (reportTokenRes.ok) {
        const reportTokenData: RetailerAccessTokenInfo | null = await reportTokenRes.json()
        setReportTokenInfo(reportTokenData)
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
      
      // Derive keyword_filters from the current textarea value (same pipeline as saveKeywordFilters)
      // so that unsaved textarea edits are not silently lost when the main save runs.
      const parsedKeywordFilters = keywordTextareaValue
        .split('\n')
        .map((f) => f.trim().toLowerCase())
        .filter((f) => f.length > 0)
      const dedupedKeywordFilters = [...new Set(parsedKeywordFilters)]

      // Include access control settings and visibility grid settings in features_enabled
      const updatedFeaturesEnabled: Record<string, any> = {
        ...featuresEnabled,
        can_access_shareview: canAccessShareView,
        enable_reports: enableReports,
        enable_live_data: enableLiveData,
      }
      
      // Add visibility grid settings
      DATA_TABS.forEach(tab => {
        updatedFeaturesEnabled[`${tab}_enabled`] = tabsEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_market_comparison_enabled`] = tabMarketComparisonEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_insights_enabled`] = tabInsightsEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_word_analysis_enabled`] = tabWordAnalysisEnabled[tab] ?? (tab === 'keywords' ? false : true)
        updatedFeaturesEnabled[`${tab}_metrics_enabled`] = tabMetricsEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_performance_table_enabled`] = tabPerformanceTableEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_selected_metrics`] = selectedTabMetrics[tab] || []
      })
      
      // Build visible_tabs array based on which tabs are enabled
      const updatedVisibleTabs = DATA_TABS.filter(tab => tabsEnabled[tab] ?? true)
      
      const response = await fetch(`/api/config/${retailerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visible_tabs: updatedVisibleTabs,
          visible_metrics: visibleMetrics,
          keyword_filters: dedupedKeywordFilters,
          features_enabled: updatedFeaturesEnabled,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save configuration')
      }

      const updated = await response.json()
      setConfig(updated)
      setFeaturesEnabled(updated.features_enabled)
      setVisibleTabs(updated.visible_tabs || [])
      // Sync keyword state so it matches what was persisted
      setKeywordFilters(dedupedKeywordFilters)
      setKeywordTextareaValue(dedupedKeywordFilters.join('\n'))
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
          token_type: pendingTokenType,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate access token')
      }

      const result: RetailerAccessTokenCreateResponse = await response.json()
      
      // Copy the new URL to clipboard immediately
      await navigator.clipboard.writeText(result.url)

      // Reload the appropriate token type
      const tokenRes = await fetch(`/api/retailers/${retailerId}/access-token?type=${pendingTokenType}`)
      if (tokenRes.ok) {
        const tokenData: RetailerAccessTokenInfo | null = await tokenRes.json()
        if (pendingTokenType === 'live_data') {
          setTokenInfo(tokenData)
        } else {
          setReportTokenInfo(tokenData)
        }
      }

      // Reset form
      setTokenForm({ expires_at: '', password: '', use_password: false })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate access token')
    } finally {
      setGeneratingToken(false)
    }
  }

  const copyToClipboard = async (text: string, type: 'live_data' | 'report_access' = 'live_data') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'live_data') {
        setCopiedToken(true)
        setTimeout(() => setCopiedToken(false), 2000)
      } else {
        setCopiedReportToken(true)
        setTimeout(() => setCopiedReportToken(false), 2000)
      }
    } catch (err) {
      alert('Failed to copy to clipboard')
    }
  }

  const deleteToken = async () => {
    try {
      const response = await fetch(`/api/retailers/${retailerId}/access-token?type=${pendingTokenType}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to delete access token')
      }
      if (pendingTokenType === 'live_data') {
        setTokenInfo(null)
      } else {
        setReportTokenInfo(null)
      }
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

  const saveKeywordFilters = async () => {
    const parsed = keywordTextareaValue
      .split('\n')
      .map(f => f.trim().toLowerCase())
      .filter(f => f.length > 0)
    const deduped = [...new Set(parsed)]

    try {
      setSavingKeywordFilters(true)
      setKeywordFilterSaveStatus('idle')

      const updatedFeaturesEnabled: Record<string, any> = {
        ...featuresEnabled,
        can_access_shareview: canAccessShareView,
        enable_reports: enableReports,
        enable_live_data: enableLiveData,
      }
      DATA_TABS.forEach(tab => {
        updatedFeaturesEnabled[`${tab}_enabled`] = tabsEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_market_comparison_enabled`] = tabMarketComparisonEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_insights_enabled`] = tabInsightsEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_word_analysis_enabled`] = tabWordAnalysisEnabled[tab] ?? (tab === 'keywords' ? false : true)
        updatedFeaturesEnabled[`${tab}_metrics_enabled`] = tabMetricsEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_performance_table_enabled`] = tabPerformanceTableEnabled[tab] ?? true
        updatedFeaturesEnabled[`${tab}_selected_metrics`] = selectedTabMetrics[tab] || []
      })
      const updatedVisibleTabs = DATA_TABS.filter(tab => tabsEnabled[tab] ?? true)

      const response = await fetch(`/api/config/${retailerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visible_tabs: updatedVisibleTabs,
          visible_metrics: visibleMetrics,
          keyword_filters: deduped,
          features_enabled: updatedFeaturesEnabled,
        }),
      })

      if (!response.ok) throw new Error('Failed to save keyword filters')

      setKeywordFilters(deduped)
      setKeywordTextareaValue(deduped.join('\n'))
      setKeywordFilterSaveStatus('success')
      setTimeout(() => setKeywordFilterSaveStatus('idle'), 3000)
    } catch {
      setKeywordFilterSaveStatus('error')
    } finally {
      setSavingKeywordFilters(false)
    }
  }

  const saveDomainSettings = async (patch: Record<string, unknown>) => {
    setSavingDomainSettings(true)
    try {
      await fetch(`/api/retailers/${retailerId}/domain-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch {
      // non-critical
    } finally {
      setSavingDomainSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 py-6">
        <div className="max-w-[1800px] px-6 mx-auto">
          <h2 className="text-2xl font-semibold text-gray-900">Retailer Settings</h2>
          <p className="text-gray-500 text-sm mt-1">Configure scheduling, access, and visibility for {retailerName}</p>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-[1800px] mx-auto">
          <SubTabNavigation
            activeTab={activeSubTab}
            tabs={[
              { id: 'scheduling', label: 'Access and Schedule' },
              { id: 'visibility', label: 'Visibility settings' },
              { id: 'ai-prompts', label: 'AI prompts' },
              { id: 'domain-customisation', label: 'Domain Customisation' },
            ]}
            onTabChange={(tab) => setActiveSubTab(tab as typeof activeSubTab)}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-[1800px] mx-auto px-6 py-6 space-y-6">
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

                {/* Live Data section */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Live Data</h4>
                  <p className="text-xs text-gray-500 mb-3">Generate a token that shows current live data to the retailer</p>
                  
                  {tokenInfo && enableLiveData && canAccessShareView ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => copyToClipboard(tokenInfo.url, 'live_data')}
                            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border ${
                              copiedToken
                                ? 'text-green-700 bg-green-50 border-green-300'
                                : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <Copy className="w-4 h-4" />
                            {copiedToken ? 'Copied!' : 'Copy URL'}
                          </button>
                          <span className="text-sm text-gray-600">
                            {tokenInfo.expires_at ? `Expires in ${getDaysUntilExpiry(tokenInfo.expires_at)} days` : 'Expires when deleted'}
                          </span>
                        </div>
                        <button
                          onClick={() => { setPendingTokenType('live_data'); setShowDeleteConfirmModal(true) }}
                          title="Delete link"
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Data period selector - NYI */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">Show</span>
                        <select 
                          className="px-3 py-1 text-sm border border-gray-300 rounded-md text-gray-900"
                        >
                          <option>All</option>
                          <option>12 months</option>
                          <option>11 months</option>
                          <option>10 months</option>
                          <option>9 months</option>
                          <option>8 months</option>
                          <option>7 months</option>
                          <option>6 months</option>
                          <option>5 months</option>
                          <option>4 months</option>
                          <option>3 months</option>
                          <option>2 months</option>
                          <option>1 month</option>
                        </select>
                        <span className="text-sm text-gray-700">Data</span>
                        <span className="text-xs text-gray-500 italic">NYI</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!canAccessShareView ? (
                        <p className="text-sm text-gray-500 italic">Enable &quot;Retailer can access ShareView&quot; to generate live data link</p>
                      ) : !enableLiveData ? (
                        <p className="text-sm text-gray-500 italic">Enable &quot;Live Data&quot; to generate link</p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-500 italic mb-3">No active live data link</p>
                          <button
                            onClick={() => { setPendingTokenType('live_data'); setShowGenerateLinkModal(true) }}
                            className="px-3 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-md"
                          >
                            Generate link
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Reports section */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Reports</h4>
                  <p className="text-xs text-gray-500 mb-3">Generate a token for sharing report links with this retailer</p>

                  {reportTokenInfo && enableReports && canAccessShareView ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => copyToClipboard(reportTokenInfo.url, 'report_access')}
                            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border ${
                              copiedReportToken
                                ? 'text-green-700 bg-green-50 border-green-300'
                                : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <Copy className="w-4 h-4" />
                            {copiedReportToken ? 'Copied!' : 'Copy URL'}
                          </button>
                          <span className="text-sm text-gray-600">
                            {reportTokenInfo.expires_at ? `Expires in ${getDaysUntilExpiry(reportTokenInfo.expires_at)} days` : 'Expires when deleted'}
                          </span>
                        </div>
                        <button
                          onClick={() => { setPendingTokenType('report_access'); setShowDeleteConfirmModal(true) }}
                          title="Delete link"
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!canAccessShareView ? (
                        <p className="text-sm text-gray-500 italic">Enable &quot;Retailer can access ShareView&quot; to generate reports link</p>
                      ) : !enableReports ? (
                        <p className="text-sm text-gray-500 italic">Enable &quot;Reports&quot; to generate link</p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-500 italic mb-3">No active reports link</p>
                          <button
                            onClick={() => { setPendingTokenType('report_access'); setShowGenerateLinkModal(true) }}
                            className="px-3 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-md"
                          >
                            Generate link
                          </button>
                        </>
                      )}
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

        {/* Visibility Settings Tab */}
        {activeSubTab === 'visibility' && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Visibility Settings Grid</h3>
              <p className="text-sm text-gray-600 mb-6">Configure which features are enabled for each tab. These settings apply to both live data and reports.</p>

              {/* Grid Container */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left p-3 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">Settings</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">Overview</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">Search Terms</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">Categories</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">Products</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700 bg-gray-50">(Auctions) <span className="text-xs text-gray-500">NYI</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Row 1: Enable Section */}
                    <tr className="border-b-2 border-gray-300">
                      <td className="p-3 font-medium text-sm text-gray-700 bg-gray-50 border-r border-gray-200">Enable section</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 text-center ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}>
                          <button
                            type="button"
                            onClick={() => setTabsEnabled({ ...tabsEnabled, [tab]: !tabsEnabled[tab] })}
                            className="inline-block"
                          >
                            {tabsEnabled[tab] ? (
                              <ToggleRight className="w-10 h-6 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-10 h-6 text-gray-400" />
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>

                    {/* Row 2: Market Comparison Tab */}
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="p-3 font-medium text-sm text-gray-700 border-r border-gray-200">Market Comparison Tab</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 text-center ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}>
                          <button 
                            type="button" 
                            onClick={() => tabsEnabled[tab] && setTabMarketComparisonEnabled({ ...tabMarketComparisonEnabled, [tab]: !tabMarketComparisonEnabled[tab] })} 
                            disabled={!tabsEnabled[tab]}
                            className="inline-block"
                          >
                            {tabMarketComparisonEnabled[tab] ? (
                              <ToggleRight className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-green-600'}`} />
                            ) : (
                              <ToggleLeft className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-gray-400'}`} />
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>

                    {/* Row 3: Insights Tab */}
                    <tr className="border-b border-gray-200">
                      <td className="p-3 font-medium text-sm text-gray-700 bg-gray-50 border-r border-gray-200">Insights Tab</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 text-center ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}>
                          <button 
                            type="button" 
                            onClick={() => tabsEnabled[tab] && setTabInsightsEnabled({ ...tabInsightsEnabled, [tab]: !tabInsightsEnabled[tab] })} 
                            disabled={!tabsEnabled[tab]}
                            className="inline-block"
                          >
                            {tabInsightsEnabled[tab] ? (
                              <ToggleRight className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-green-600'}`} />
                            ) : (
                              <ToggleLeft className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-gray-400'}`} />
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>

                    {/* Row 4: Word Analysis Tab */}
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="p-3 font-medium text-sm text-gray-700 border-r border-gray-200">Word Analysis Tab</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 text-center ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}>
                          {tab === 'keywords' ? (
                            <button 
                              type="button" 
                              onClick={() => tabsEnabled[tab] && setTabWordAnalysisEnabled({ ...tabWordAnalysisEnabled, [tab]: !tabWordAnalysisEnabled[tab] })} 
                              disabled={!tabsEnabled[tab]}
                              className="inline-block"
                            >
                              {tabWordAnalysisEnabled[tab] ? (
                                <ToggleRight className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-green-600'}`} />
                              ) : (
                                <ToggleLeft className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-gray-400'}`} />
                              )}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Performance Section Header */}
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                      <td colSpan={6} className="p-3 font-bold text-sm text-gray-700 bg-gray-50">Performance</td>
                    </tr>

                    {/* Row 5: Metrics */}
                    <tr className="border-b border-gray-200">
                      <td className="p-3 font-medium text-sm text-gray-700 bg-gray-50 border-r border-gray-200">Metrics</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 text-center ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}>
                          <button
                            type="button"
                            onClick={() => tabsEnabled[tab] && setTabMetricsEnabled({ ...tabMetricsEnabled, [tab]: !tabMetricsEnabled[tab] })}
                            disabled={!tabsEnabled[tab]}
                            className="inline-block"
                          >
                            {tabMetricsEnabled[tab] ? (
                              <ToggleRight className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-green-600'}`} />
                            ) : (
                              <ToggleLeft className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-gray-400'}`} />
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>

                    {/* Row 6: Specific Metrics */}
                    <tr className="border-b border-gray-200">
                      <td className="p-3 font-medium text-sm text-gray-700 pl-8 bg-gray-50 border-r border-gray-200"></td>
                      {DATA_TABS.map((tab, idx) => {
                        const metrics = tab === 'overview' ? OVERVIEW_METRICS :
                                      tab === 'keywords' ? KEYWORDS_METRICS :
                                      tab === 'categories' ? CATEGORIES_METRICS :
                                      tab === 'products' ? PRODUCTS_METRICS : []
                        const enabled = tabsEnabled[tab] && tabMetricsEnabled[tab]
                        return (
                          <td key={`${tab}-metrics`} className={`p-3 bg-white ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}>
                            {metrics.length > 0 ? (
                              <div className="space-y-1">
                                {metrics.map(metric => (
                                  <label key={`${tab}-${metric.id}`} className={`flex items-center gap-2 text-xs ${enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                    <input
                                      type="checkbox"
                                      checked={selectedTabMetrics[tab]?.includes(metric.id) ?? false}
                                      onChange={(e) => {
                                        if (!enabled) return
                                        const current = selectedTabMetrics[tab] || []
                                        const updated = e.target.checked 
                                          ? [...current, metric.id]
                                          : current.filter(m => m !== metric.id)
                                        setSelectedTabMetrics({ ...selectedTabMetrics, [tab]: updated })
                                      }}
                                      disabled={!enabled}
                                      className="w-3 h-3"
                                    />
                                    <span className="text-gray-700">{metric.label}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>

                    {/* Row 7: Performance Table */}
                    <tr className="border-b border-gray-200">
                      <td className="p-3 font-medium text-sm text-gray-700 bg-gray-50 border-r border-gray-200">Performance Table</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 text-center ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}>
                          <button
                            type="button"
                            onClick={() => tabsEnabled[tab] && setTabPerformanceTableEnabled({ ...tabPerformanceTableEnabled, [tab]: !tabPerformanceTableEnabled[tab] })}
                            disabled={!tabsEnabled[tab]}
                            className="inline-block"
                          >
                            {tabPerformanceTableEnabled[tab] ? (
                              <ToggleRight className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-green-600'}`} />
                            ) : (
                              <ToggleLeft className={`w-10 h-6 ${!tabsEnabled[tab] ? 'text-gray-300' : 'text-gray-400'}`} />
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>

                    {/* Market Comparison Section Header */}
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                      <td colSpan={6} className="p-3 font-bold text-sm text-gray-700 bg-gray-50">Market Comparison</td>
                    </tr>

                    {/* Market Comparison Settings Row */}
                    <tr className="border-b border-gray-200">
                      <td className="p-3 text-sm text-gray-500 italic bg-gray-50 border-r border-gray-200">NYI</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}></td>
                      ))}
                    </tr>

                    {/* Insights Section Header */}
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                      <td colSpan={6} className="p-3 font-bold text-sm text-gray-700 bg-gray-50">Insights</td>
                    </tr>

                    {/* Insights Settings Row */}
                    <tr className="border-b border-gray-200">
                      <td className="p-3 text-sm text-gray-500 italic bg-gray-50 border-r border-gray-200">NYI</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}></td>
                      ))}
                    </tr>

                    {/* Word Analysis Section Header */}
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                      <td colSpan={6} className="p-3 font-bold text-sm text-gray-700 bg-gray-50">Word Analysis</td>
                    </tr>

                    {/* Word Analysis Settings Row */}
                    <tr className="border-b border-gray-200">
                      <td className="p-3 text-sm text-gray-500 italic bg-gray-50 border-r border-gray-200">NYI</td>
                      {DATA_TABS.map((tab, idx) => (
                        <td key={tab} className={`p-3 ${idx < DATA_TABS.length - 1 ? 'border-r border-gray-200' : ''}`}></td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Excluded Search Terms Section */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h4 className="text-md font-semibold text-gray-900 mb-4">Excluded Search Terms</h4>
                <textarea
                  value={keywordTextareaValue}
                  onChange={(e) => setKeywordTextareaValue(e.target.value)}
                  placeholder="One exclusion per line"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 text-sm"
                  rows={6}
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={saveKeywordFilters}
                    disabled={savingKeywordFilters}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-md text-sm disabled:opacity-50"
                  >
                    {savingKeywordFilters ? 'Saving...' : 'Save exclusions'}
                  </button>
                  {keywordFilterSaveStatus === 'success' && (
                    <span className="text-sm text-green-600">Exclusions saved successfully.</span>
                  )}
                  {keywordFilterSaveStatus === 'error' && (
                    <span className="text-sm text-red-600">Failed to save exclusions. Please try again.</span>
                  )}
                </div>
              </div>

              <button
                ref={saveVisibilityButtonRef}
                onClick={saveConfig}
                disabled={savingConfig}
                className="mt-6 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save visibility settings'}
              </button>
            </div>
          </>
        )}

        {/* Domain Customisation Tab */}
        {activeSubTab === 'domain-customisation' && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Categories domain</p>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Category Benchmark Trimming</h3>
              <p className="text-sm text-gray-500 mb-6">
                Applies to the <strong>Categories</strong> domain only. When enabled, only the top
                categories covering approximately 85% of impressions are used as the quality benchmark
                for tier classification. This prevents a handful of dominant categories from setting an
                unfair standard for the rest. Retailers with 75 or fewer scorable categories always use
                all categories regardless of this setting.
              </p>

              {loadingDomainSettings ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                <>
                  {/* Toggle */}
                  <div className="flex items-center justify-between py-4 border-t border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Apply category benchmark trimming</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {categoryTrimmingEnabled
                          ? 'Enabled — top categories by impression volume form the benchmark.'
                          : 'Disabled — all scorable categories form the benchmark.'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const next = !categoryTrimmingEnabled
                        setCategoryTrimmingEnabled(next)
                        saveDomainSettings({ categories_trimming_enabled: next })
                      }}
                      disabled={savingDomainSettings}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                        categoryTrimmingEnabled ? 'bg-gray-900' : 'bg-gray-300'
                      }`}
                      aria-label="Toggle category benchmark trimming"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          categoryTrimmingEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Benchmark summary from most recent snapshot */}
                  {benchmarkInfo?.period ? (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Most recent snapshot — {benchmarkInfo.period}
                      </p>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-gray-50 rounded p-3">
                          <p className="text-xs text-gray-500">Strategy</p>
                          <p className="text-sm font-medium text-gray-900">
                            {benchmarkInfo.benchmark_strategy === 'all' ? 'All categories' : 'Top 85% by impressions'}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded p-3">
                          <p className="text-xs text-gray-500">Categories in benchmark</p>
                          <p className="text-sm font-medium text-gray-900">
                            {benchmarkInfo.benchmark_node_count} of {benchmarkInfo.total_scorable_nodes}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded p-3">
                          <p className="text-xs text-gray-500">Impressions covered</p>
                          <p className="text-sm font-medium text-gray-900">
                            {benchmarkInfo.benchmark_impression_pct != null
                              ? `${benchmarkInfo.benchmark_impression_pct}%`
                              : '–'}
                          </p>
                        </div>
                      </div>

                      {benchmarkInfo.total_trimmed > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            {benchmarkInfo.total_trimmed} trimmed{' '}
                            {benchmarkInfo.total_trimmed === 1 ? 'category' : 'categories'} — excluded from benchmark
                          </p>
                          <ul className="space-y-1">
                            {(showAllTrimmed
                              ? benchmarkInfo.trimmed_categories
                              : benchmarkInfo.trimmed_categories.slice(0, 5)
                            ).map(cat => (
                              <li
                                key={cat.full_path}
                                className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0"
                              >
                                <span className="text-gray-700 truncate max-w-[60%]" title={cat.full_path}>
                                  {cat.full_path}
                                </span>
                                <span className="text-gray-400 shrink-0 ml-2">
                                  {cat.node_impressions.toLocaleString()} impr
                                  {cat.health_status_node ? ` · ${cat.health_status_node}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {benchmarkInfo.total_trimmed > 5 && (
                            <button
                              onClick={() => setShowAllTrimmed(v => !v)}
                              className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                            >
                              {showAllTrimmed
                                ? 'Show fewer'
                                : `Show all ${benchmarkInfo.total_trimmed} trimmed categories`}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">
                          All scorable categories are included in the benchmark.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-100">
                      No snapshot data yet. Run the pipeline to generate category snapshots.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Floating Save Visibility Bar */}
      {showStickyBar && (
        <div className="fixed bottom-0 left-0 right-0 z-40 transition-transform duration-200">
          <div className="bg-white border-t border-gray-200 shadow-lg">
            <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-600">You have unsaved visibility changes.</p>
              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-md text-sm disabled:opacity-50 whitespace-nowrap"
              >
                {savingConfig ? 'Saving...' : 'Save visibility settings'}
              </button>
            </div>
          </div>
        </div>
      )}

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
