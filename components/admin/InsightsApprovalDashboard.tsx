'use client'

import React, { useState, useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, Edit, FileText, PlayCircle, Loader, Settings } from 'lucide-react'
import InsightEditorModal from '../dashboard/InsightEditorModal'

interface Insight {
  id: number
  retailer_id: string
  page_type: string
  tab_name: string
  period_start: string
  period_end: string
  insight_type: string
  insight_data: any
  status: string
  is_active: boolean
  approved_by: number | null
  approved_at: string | null
  published_by: number | null
  published_at: string | null
  created_at: string
  report_id: number | null
}

interface Filters {
  retailer: string
  pageType: string
  status: string
}

interface GenerationForm {
  retailer_id: string
  page_type: string
  tab_name: string
  period_start: string
  period_end: string
}

interface PromptForm {
  page_type: string
  tab_name: string
  insight_type: string
  prompt_text: string
  style_directive: string
}

export default function InsightsApprovalDashboard() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({
    retailer: '',
    pageType: '',
    status: 'pending',
  })
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingInsight, setEditingInsight] = useState<Insight | null>(null)
  const [showGenerationPanel, setShowGenerationPanel] = useState(false)
  const [generationForm, setGenerationForm] = useState<GenerationForm>({
    retailer_id: '',
    page_type: 'overview',
    tab_name: 'insights',
    period_start: '',
    period_end: '',
  })
  const [generating, setGenerating] = useState(false)
  const [generationJobId, setGenerationJobId] = useState<number | null>(null)
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [promptForm, setPromptForm] = useState<PromptForm>({
    page_type: 'overview',
    tab_name: 'insights',
    insight_type: 'insight_panel',
    prompt_text: '',
    style_directive: 'standard',
  })
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)

  const fetchInsights = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.retailer) params.set('retailerId', filters.retailer)
      if (filters.pageType) params.set('pageType', filters.pageType)

      const response = await fetch(`/api/insights/pending?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch insights')

      const data = await response.json()
      setInsights(data)
    } catch (error) {
      console.error('Error fetching insights:', error)
      setActionMessage({ type: 'error', text: 'Failed to load insights' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInsights()
  }, [filters])

  useEffect(() => {
    if (!generationJobId) return

    const pollJob = async () => {
      try {
        const response = await fetch(`/api/insights/jobs/${generationJobId}`)
        if (!response.ok) return

        const job = await response.json()
        
        if (job.status === 'completed') {
          setActionMessage({ type: 'success', text: 'Insights generated successfully' })
          setGenerating(false)
          setGenerationJobId(null)
          fetchInsights()
          setTimeout(() => setActionMessage(null), 3000)
        } else if (job.status === 'failed') {
          setActionMessage({ type: 'error', text: `Generation failed: ${job.error_message || 'Unknown error'}` })
          setGenerating(false)
          setGenerationJobId(null)
        }
      } catch (error) {
        console.error('Error polling job:', error)
      }
    }

    const interval = setInterval(pollJob, 2000)
    return () => clearInterval(interval)
  }, [generationJobId])

  const handleGenerate = async () => {
    if (!generationForm.retailer_id || !generationForm.period_start || !generationForm.period_end) {
      setActionMessage({ type: 'error', text: 'Please fill in all required fields' })
      return
    }

    try {
      setGenerating(true)
      const response = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generationForm),
      })

      if (!response.ok) throw new Error('Failed to generate insights')

      const result = await response.json()
      setGenerationJobId(result.job_id)
    } catch (error) {
      console.error('Error generating insights:', error)
      setActionMessage({ type: 'error', text: 'Failed to generate insights' })
      setGenerating(false)
    }
  }

  const handleApprove = async (id: number) => {
    try {
      const response = await fetch(`/api/insights/${id}/approve`, {
        method: 'POST',
      })

      if (!response.ok) throw new Error('Failed to approve insight')

      setActionMessage({ type: 'success', text: 'Insight approved and ready for publication' })
      fetchInsights()

      setTimeout(() => setActionMessage(null), 3000)
    } catch (error) {
      console.error('Error approving insight:', error)
      setActionMessage({ type: 'error', text: 'Failed to approve insight' })
    }
  }

  const handleReject = async (id: number) => {
    try {
      const response = await fetch(`/api/insights/${id}/reject`, {
        method: 'POST',
      })

      if (!response.ok) throw new Error('Failed to reject insight')

      setActionMessage({ type: 'success', text: 'Insight rejected successfully' })
      fetchInsights()

      setTimeout(() => setActionMessage(null), 3000)
    } catch (error) {
      console.error('Error rejecting insight:', error)
      setActionMessage({ type: 'error', text: 'Failed to reject insight' })
    }
  }

  const handlePublish = async (id: number) => {
    try {
      const response = await fetch(`/api/insights/${id}/publish`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to publish insight')
      }

      setActionMessage({ type: 'success', text: 'Insight published successfully' })
      fetchInsights()

      setTimeout(() => setActionMessage(null), 3000)
    } catch (error) {
      console.error('Error publishing insight:', error)
      setActionMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to publish insight' })
    }
  }

  const handlePublishReport = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/${reportId}/publish`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to publish report')
      }

      setActionMessage({ type: 'success', text: 'Report published successfully' })
      fetchInsights()

      setTimeout(() => setActionMessage(null), 3000)
    } catch (error) {
      console.error('Error publishing report:', error)
      setActionMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to publish report' })
    }
  }

  const handleEdit = (insight: Insight) => {
    setEditingInsight(insight)
  }

  const handleSaveEdit = async (data: { insight_data: any; status: string }) => {
    if (!editingInsight) return

    try {
      const response = await fetch(`/api/insights/${editingInsight.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Failed to update insight')

      setActionMessage({ type: 'success', text: 'Insight updated successfully' })
      fetchInsights()
      setEditingInsight(null)

      setTimeout(() => setActionMessage(null), 3000)
    } catch (error) {
      console.error('Error updating insight:', error)
      throw error
    }
  }

  const loadPromptTemplate = async (pageType: string, insightType: string) => {
    setPromptLoading(true)
    try {
      const response = await fetch(`/api/insights/prompt-templates?pageType=${pageType}&insightType=${insightType}`)
      if (!response.ok) throw new Error('Failed to load prompt template')

      const data = await response.json()
      if (data.length > 0) {
        const row = data[0]
        setPromptForm({
          ...promptForm,
          prompt_text: row.prompt_text,
          style_directive: row.style_directive || 'standard',
        })
      } else {
        setPromptForm({
          ...promptForm,
          prompt_text: '',
          style_directive: 'standard',
        })
      }
    } catch (error) {
      console.error('Error loading prompt template:', error)
    } finally {
      setPromptLoading(false)
    }
  }

  const handleSavePrompt = async () => {
    try {
      const response = await fetch('/api/insights/prompt-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptForm),
      })

      if (!response.ok) throw new Error('Failed to save prompt template')

      setPromptSaved(true)
      setTimeout(() => setPromptSaved(false), 3000)
    } catch (error) {
      console.error('Error saving prompt:', error)
      setActionMessage({ type: 'error', text: 'Failed to save prompt template' })
    }
  }

  useEffect(() => {
    if (showPromptPanel) {
      loadPromptTemplate(promptForm.page_type, promptForm.insight_type)
    }
  }, [promptForm.page_type, promptForm.insight_type, showPromptPanel])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
            <FileText className="w-3 h-3" />
            Draft
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800">
            <AlertCircle className="w-3 h-3" />
            Pending
          </span>
        )
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        )
      default:
        return null
    }
  }

  const getInsightPreview = (data: any) => {
    if (!data) return 'No insight data'
    
    if (typeof data === 'string') return data.substring(0, 150) + '...'
    
    if (data.insights && Array.isArray(data.insights) && data.insights.length > 0) {
      const firstInsight = data.insights[0]
      if (firstInsight.text) return firstInsight.text.substring(0, 150) + '...'
      if (firstInsight.message) return firstInsight.message.substring(0, 150) + '...'
    }

    if (data.headline) return data.headline
    if (data.beatRivals && data.beatRivals[0]) return data.beatRivals[0].substring(0, 150) + '...'
    if (data.quickWins && data.quickWins[0]) return data.quickWins[0].substring(0, 150) + '...'
    if (data.message) return data.message.substring(0, 150) + '...'
    
    return JSON.stringify(data).substring(0, 150) + '...'
  }

  const uniqueRetailers = Array.from(new Set(insights.map(i => i.retailer_id))).sort()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F59E0B]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Generation Panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Generate New Insights</h3>
          <button
            onClick={() => setShowGenerationPanel(!showGenerationPanel)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {showGenerationPanel ? 'Hide' : 'Show'}
          </button>
        </div>

        {showGenerationPanel && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retailer ID *</label>
              <input
                type="text"
                value={generationForm.retailer_id}
                onChange={(e) => setGenerationForm({ ...generationForm, retailer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                placeholder="boots"
                disabled={generating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Page Type</label>
              <select
                value={generationForm.page_type}
                onChange={(e) => setGenerationForm({ ...generationForm, page_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                disabled={generating}
              >
                <option value="overview">Overview</option>
                <option value="keywords">Keywords</option>
                <option value="categories">Categories</option>
                <option value="products">Products</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period Start *</label>
              <input
                type="date"
                value={generationForm.period_start}
                onChange={(e) => setGenerationForm({ ...generationForm, period_start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                disabled={generating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period End *</label>
              <input
                type="date"
                value={generationForm.period_end}
                onChange={(e) => setGenerationForm({ ...generationForm, period_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                disabled={generating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">&nbsp;</label>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full px-4 py-2 bg-[#F59E0B] text-white text-sm font-medium rounded-md hover:bg-[#D97706] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Prompt Templates Panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#F59E0B]" />
            <h3 className="text-lg font-semibold text-gray-900">Prompt Templates</h3>
          </div>
          <button
            onClick={() => setShowPromptPanel(!showPromptPanel)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {showPromptPanel ? 'Hide' : 'Edit Prompts'}
          </button>
        </div>

        {showPromptPanel && (
          <div className="space-y-4">
            {/* Row 1: 3 dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Page Type</label>
                <select
                  value={promptForm.page_type}
                  onChange={(e) => setPromptForm({ ...promptForm, page_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  disabled={promptLoading}
                >
                  <option value="overview">Overview</option>
                  <option value="keywords">Keywords</option>
                  <option value="categories">Categories</option>
                  <option value="products">Products</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insight Type</label>
                <select
                  value={promptForm.insight_type}
                  onChange={(e) => setPromptForm({ ...promptForm, insight_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  disabled={promptLoading}
                >
                  <option value="insight_panel">Insight Panel</option>
                  <option value="market_analysis">Market Analysis</option>
                  <option value="recommendation">Recommendation</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Style Directive</label>
                <select
                  value={promptForm.style_directive}
                  onChange={(e) => setPromptForm({ ...promptForm, style_directive: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  disabled={promptLoading}
                >
                  <option value="standard">Standard</option>
                  <option value="concise">Concise</option>
                  <option value="detailed">Detailed</option>
                  <option value="exec-summary">Executive Summary</option>
                </select>
              </div>
            </div>

            {/* Row 2: Prompt textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Text</label>
              <textarea
                rows={6}
                value={promptForm.prompt_text}
                onChange={(e) => setPromptForm({ ...promptForm, prompt_text: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                placeholder="Enter prompt text..."
                disabled={promptLoading}
              />
            </div>

            {/* Row 3: Save button + confirmation */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSavePrompt}
                disabled={promptLoading}
                className="px-4 py-2 bg-[#F59E0B] text-white text-sm font-medium rounded-md hover:bg-[#D97706] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {promptLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Save Prompt'
                )}
              </button>
              {promptSaved && (
                <span className="text-sm text-green-600 font-medium">✓ Saved</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retailer
            </label>
            <select
              value={filters.retailer}
              onChange={(e) => setFilters({ ...filters, retailer: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            >
              <option value="">All Retailers</option>
              {uniqueRetailers.map((retailer) => (
                <option key={retailer} value={retailer}>
                  {retailer}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Page Type
            </label>
            <select
              value={filters.pageType}
              onChange={(e) => setFilters({ ...filters, pageType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            >
              <option value="">All Page Types</option>
              <option value="overview">Overview</option>
              <option value="keywords">Keywords</option>
              <option value="categories">Categories</option>
              <option value="products">Products</option>
              <option value="auctions">Auctions</option>
              <option value="coverage">Coverage</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            >
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div
          className={`p-4 rounded-md ${
            actionMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Insights List */}
      {insights.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No insights found for the selected filters
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {insight.retailer_id}
                    </h3>
                    {getStatusBadge(insight.status)}
                    {insight.report_id && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-md">
                        <FileText className="w-3 h-3" />
                        Report #{insight.report_id}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="font-medium">{insight.page_type}</span>
                    {insight.tab_name && <span>• {insight.tab_name}</span>}
                    <span>
                      • {new Date(insight.period_start).toLocaleDateString()} -{' '}
                      {new Date(insight.period_end).toLocaleDateString()}
                    </span>
                  </div>
                  {insight.published_at && (
                    <div className="text-xs text-gray-500 mt-1">
                      Published {new Date(insight.published_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-700">{getInsightPreview(insight.insight_data)}</p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Created {new Date(insight.created_at).toLocaleString()}
                </span>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(insight)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>

                  {insight.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(insight.id)}
                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors flex items-center gap-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(insight.id)}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors flex items-center gap-1"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </>
                  )}

                  {insight.status === 'approved' && !insight.is_active && (
                    <>
                      <button
                        onClick={() => handlePublish(insight.id)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1"
                      >
                        <PlayCircle className="w-4 h-4" />
                        Publish
                      </button>
                      {insight.report_id && (
                        <button
                          onClick={() => handlePublishReport(insight.report_id!)}
                          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-4 h-4" />
                          Publish Report
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingInsight && (
        <InsightEditorModal
          insight={editingInsight}
          onSave={handleSaveEdit}
          onClose={() => setEditingInsight(null)}
        />
      )}
    </div>
  )
}
