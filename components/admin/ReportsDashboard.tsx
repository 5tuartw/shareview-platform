'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Eye, Send, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

interface Retailer {
  retailer_id: string
  retailer_name: string
}

interface ReportListItem {
  id: number
  retailer_id: number
  retailer_name: string
  period_start: string
  period_end: string
  period_type: string
  status: string
  report_type: string
  created_at: string
  published_at?: string
  published_by?: number
}

interface ReportDomainItem {
  domain: string
  performance_table: Record<string, unknown> | null
  domain_metrics: Record<string, unknown> | null
  ai_insights: {
    insightsPanel: Record<string, unknown> | null
    marketAnalysis: Record<string, unknown> | null
    recommendation: Record<string, unknown> | null
    showAIDisclaimer: boolean
  }
  insight_status?: string | null
}

interface ReportDetail {
  id: number
  retailer_id: number
  retailer_name: string
  period_start: string
  period_end: string
  period_type: string
  status: string
  report_type: string
  created_at: string
  published_at?: string
  published_by?: number
  auto_approve: boolean
  domains: ReportDomainItem[]
}

interface CreateFormState {
  retailer_id: string
  period_type: string
  period_start: string
  period_end: string
  domains: string[]
  auto_approve: boolean
}

export default function ReportsDashboard() {
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filter states
  const [selectedRetailerId, setSelectedRetailerId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Create form state
  const [createForm, setCreateForm] = useState<CreateFormState>({
    retailer_id: '',
    period_type: 'monthly',
    period_start: '',
    period_end: '',
    domains: [],
    auto_approve: false,
  })

  const availableDomains = ['overview', 'keywords', 'categories', 'products', 'auctions']

  // Fetch retailers
  useEffect(() => {
    fetch('/api/retailers')
      .then((res) => res.json())
      .then((data) => setRetailers(data))
      .catch((err) => console.error('Failed to fetch retailers:', err))
  }, [])

  // Fetch reports
  const fetchReports = () => {
    if (!selectedRetailerId) return
    
    fetch(`/api/reports?retailerId=${selectedRetailerId}`)
      .then((res) => res.json())
      .then((data) => setReports(data))
      .catch((err) => console.error('Failed to fetch reports:', err))
  }

  useEffect(() => {
    fetchReports()
  }, [selectedRetailerId])

  // Create report
  const handleCreateReport = async () => {
    if (!createForm.retailer_id || !createForm.period_start || !createForm.period_end || createForm.domains.length === 0) {
      setActionMessage({ type: 'error', text: 'Please fill all required fields' })
      setTimeout(() => setActionMessage(null), 3000)
      return
    }

    setCreating(true)
    setActionMessage(null)

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailer_id: createForm.retailer_id,
          period_type: createForm.period_type,
          period_start: createForm.period_start,
          period_end: createForm.period_end,
          domains: createForm.domains,
          auto_approve: createForm.auto_approve,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create report')
      }

      const newReport = await response.json()
      setActionMessage({ type: 'success', text: `Report #${newReport.id} created successfully` })
      
      // Reset form and refresh list
      setCreateForm({
        retailer_id: '',
        period_type: 'monthly',
        period_start: '',
        period_end: '',
        domains: [],
        auto_approve: false,
      })
      setShowCreatePanel(false)
      fetchReports()
      
      // Auto-select the new report
      viewReport(newReport.id)

      setTimeout(() => setActionMessage(null), 5000)
    } catch (error) {
      setActionMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to create report' })
      setTimeout(() => setActionMessage(null), 5000)
    } finally {
      setCreating(false)
    }
  }

  // View report details
  const viewReport = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (!response.ok) throw new Error('Failed to fetch report')
      const data = await response.json()
      setSelectedReport(data)
    } catch (error) {
      setActionMessage({ type: 'error', text: 'Failed to load report details' })
      setTimeout(() => setActionMessage(null), 3000)
    }
  }

  // Publish report
  const handlePublishReport = async (reportId: number) => {
    setActionMessage(null)
    try {
      const response = await fetch(`/api/reports/${reportId}/publish`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to publish report')
      }

      setActionMessage({ type: 'success', text: `Report #${reportId} published successfully` })
      fetchReports()
      if (selectedReport?.id === reportId) {
        viewReport(reportId)
      }
      setTimeout(() => setActionMessage(null), 5000)
    } catch (error) {
      setActionMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to publish report' })
      setTimeout(() => setActionMessage(null), 5000)
    }
  }

  // Toggle domain selection
  const toggleDomain = (domain: string) => {
    setCreateForm((prev) => ({
      ...prev,
      domains: prev.domains.includes(domain)
        ? prev.domains.filter((d) => d !== domain)
        : [...prev.domains, domain],
    }))
  }

  // Filter reports
  const filteredReports = reports.filter((report) => {
    if (statusFilter && report.status !== statusFilter) return false
    return true
  })
  
  // Check if all insights are approved
  const allInsightsApproved = selectedReport?.domains.every(
    (domain) => domain.insight_status === 'approved'
  ) ?? false

  // Status badge
  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      draft: { icon: Clock, color: 'bg-gray-100 text-gray-700', label: 'Draft' },
      published: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Published' },
      archived: { icon: XCircle, color: 'bg-slate-100 text-slate-700', label: 'Archived' },
    }[status] || { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-700', label: status }

    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    )
  }

  // Insight status badge
  const InsightStatusBadge = ({ status }: { status: string | null | undefined }) => {
    if (!status) return <span className="text-xs text-gray-400">No insight</span>

    const config = {
      pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
      approved: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Approved' },
      rejected: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Rejected' },
    }[status] || { icon: AlertCircle, color: 'bg-gray-100 text-gray-700', label: status }

    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Action Message */}
      {actionMessage && (
        <div
          className={`p-4 rounded-lg border ${
            actionMessage.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Section A: Create Report Panel */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <button
          onClick={() => setShowCreatePanel(!showCreatePanel)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#F59E0B]" />
            <h2 className="text-lg font-semibold text-gray-900">Create New Report</h2>
          </div>
          {showCreatePanel ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        {showCreatePanel && (
          <div className="px-6 py-4 border-t border-gray-200 space-y-4">
            {/* Retailer Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Retailer *</label>
              <select
                value={createForm.retailer_id}
                onChange={(e) => setCreateForm({ ...createForm, retailer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              >
                <option value="">Select a retailer...</option>
                {retailers.map((r) => (
                  <option key={r.retailer_id} value={r.retailer_id}>
                    {r.retailer_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Period Selection */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Period Type</label>
                <select
                  value={createForm.period_type}
                  onChange={(e) => setCreateForm({ ...createForm, period_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                <input
                  type="date"
                  value={createForm.period_start}
                  onChange={(e) => setCreateForm({ ...createForm, period_start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date *</label>
                <input
                  type="date"
                  value={createForm.period_end}
                  onChange={(e) => setCreateForm({ ...createForm, period_end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                />
              </div>
            </div>

            {/* Domain Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Domains * (select at least one)</label>
              <div className="flex gap-4">
                {availableDomains.map((domain) => (
                  <label key={domain} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm.domains.includes(domain)}
                      onChange={() => toggleDomain(domain)}
                      className="w-4 h-4 text-[#F59E0B] border-gray-300 rounded focus:ring-[#F59E0B]"
                    />
                    <span className="text-sm text-gray-700 capitalize">{domain.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Auto-approve */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.auto_approve}
                  onChange={(e) => setCreateForm({ ...createForm, auto_approve: e.target.checked })}
                  className="w-4 h-4 text-[#F59E0B] border-gray-300 rounded focus:ring-[#F59E0B]"
                />
                <span className="text-sm text-gray-700">Auto-approve insights and publish immediately</span>
              </label>
            </div>

            {/* Create Button */}
            <div className="flex justify-end">
              <button
                onClick={handleCreateReport}
                disabled={creating}
                className="px-6 py-2 bg-[#F59E0B] text-white rounded-md hover:bg-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creating & Generating...' : 'Create & Generate'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section B: Reports List */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reports</h2>
          
          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1">
              <select
                value={selectedRetailerId}
                onChange={(e) => setSelectedRetailerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              >
                <option value="">Select a Retailer</option>
                {retailers.map((r) => (
                  <option key={r.retailer_id} value={r.retailer_id}>
                    {r.retailer_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reports Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retailer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No reports found
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{report.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{report.retailer_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(report.period_start).toLocaleDateString()} - {new Date(report.period_end).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{report.period_type}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(report.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => viewReport(report.id)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {report.status === 'draft' && (
                          <button
                            onClick={() => handlePublishReport(report.id)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                            title="Publish Report"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section C: Report Detail Panel */}
      {selectedReport && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Report #{selectedReport.id} - {selectedReport.retailer_name}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {new Date(selectedReport.period_start).toLocaleDateString()} - {new Date(selectedReport.period_end).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedReport.status} />
                {selectedReport.status === 'draft' && (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => handlePublishReport(selectedReport.id)}
                      disabled={!allInsightsApproved}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!allInsightsApproved ? 'All insights must be approved before publishing' : ''}
                    >
                      <Send className="w-4 h-4" />
                      Publish Report
                    </button>
                    {!allInsightsApproved && (
                      <span className="text-xs text-amber-600">Awaiting insight approvals</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Domain Status Table */}
          <div className="p-6">
            <h3 className="text-md font-semibold text-gray-900 mb-4">Domain Insights Status</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domain</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insight Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Performance Table</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domain Metrics</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI Insights</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedReport.domains.map((domain) => (
                    <tr key={domain.domain} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">
                        {domain.domain.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <InsightStatusBadge status={domain.insight_status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {domain.performance_table ? (
                          <span className="text-green-600">✓ Available</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {domain.domain_metrics ? (
                          <span className="text-green-600">✓ Available</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {domain.ai_insights.insightsPanel || domain.ai_insights.marketAnalysis ? (
                          <span className="text-green-600">✓ Generated</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
