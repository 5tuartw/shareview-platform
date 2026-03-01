'use client'

import { useState, useEffect, useCallback } from 'react'
import { Archive, Trash2, Eye, EyeOff, RefreshCw, Link as LinkIcon, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { ReportListItem } from '@/types'
import SnapshotCreationModal from './SnapshotCreationModal'

interface RetailerReportsPanelProps {
  retailerId: string
}

type ConfirmDialogType = {
  type: 'archive' | 'delete'
  reportId: number
  reportTitle: string
} | null

export default function RetailerReportsPanel({ retailerId }: RetailerReportsPanelProps) {
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [editingReport, setEditingReport] = useState<ReportListItem | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogType>(null)
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null)
  const [linkActionId, setLinkActionId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [generateLinkModal, setGenerateLinkModal] = useState<{
    report: ReportListItem
    expiresAt: string
    error?: string
    needsEnable?: boolean
    enabling?: boolean
  } | null>(null)

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/reports?retailerId=${retailerId}&showArchived=${showArchived}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch reports')
      }

      const data = await response.json()
      setReports(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [retailerId, showArchived])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleArchive = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: true }),
      })

      if (!response.ok) {
        throw new Error('Failed to archive report')
      }

      setConfirmDialog(null)
      await fetchReports()
    } catch (err) {
      console.error('Error archiving report:', err)
      alert('Failed to archive report')
    }
  }

  const handleDelete = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete report')
      }

      setConfirmDialog(null)
      await fetchReports()
    } catch (err) {
      console.error('Error deleting report:', err)
      alert('Failed to delete report')
    }
  }

  const handleToggleVisibility = async (report: ReportListItem) => {
    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden_from_retailer: !report.hidden_from_retailer }),
      })

      if (!response.ok) {
        throw new Error('Failed to update report visibility')
      }

      await fetchReports()
    } catch (err) {
      console.error('Error updating visibility:', err)
      alert('Failed to update report visibility')
    }
  }

  const handleRegenerate = async (reportId: number) => {
    try {
      setRegeneratingId(reportId)
      const response = await fetch(`/api/reports/${reportId}/regenerate`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to regenerate report')
      }

      await fetchReports()
    } catch (err) {
      console.error('Error regenerating report:', err)
      alert('Failed to regenerate report')
    } finally {
      setRegeneratingId(null)
    }
  }

  const handleDeactivateLink = async (report: ReportListItem) => {
    if (!report.token_info) return
    try {
      setLinkActionId(report.id)
      const response = await fetch(
        `/api/retailers/${retailerId}/access-token/${report.token_info.id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        throw new Error('Failed to deactivate link')
      }

      await fetchReports()
    } catch (err) {
      console.error('Error deactivating link:', err)
      alert('Failed to deactivate link')
    } finally {
      setLinkActionId(null)
    }
  }

  const handleCopyLink = async (report: ReportListItem) => {
    if (!report.token_info) return
    const url = `${report.token_info.url}?reportId=${report.id}`
    await navigator.clipboard.writeText(url)
    setCopiedId(report.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDataStatusChange = async (report: ReportListItem, newStatus: 'approved' | 'pending') => {
    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus === 'approved' ? 'published' : 'draft' }),
      })
      if (!response.ok) throw new Error('Failed to update data status')
      await fetchReports()
    } catch (err) {
      console.error('Error updating data status:', err)
      alert('Failed to update data status')
    }
  }

  const handleInsightStatusChange = async (report: ReportListItem, newStatus: 'approved' | 'pending') => {
    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_status: newStatus }),
      })
      if (!response.ok) throw new Error('Failed to update insight status')
      await fetchReports()
    } catch (err) {
      console.error('Error updating insight status:', err)
      alert('Failed to update insight status')
    }
  }

  const handleGenerateModalLink = async () => {
    if (!generateLinkModal) return
    const reportId = generateLinkModal.report.id
    const expiresAt = generateLinkModal.expiresAt
    // Clear any previous error
    setGenerateLinkModal((prev) => prev ? { ...prev, error: undefined, needsEnable: undefined } : null)
    try {
      const body: Record<string, unknown> = { report_id: reportId }
      if (expiresAt) body.expires_at = expiresAt
      const response = await fetch(`/api/retailers/${retailerId}/access-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.status === 403) {
        const data = await response.json()
        // Keep modal open, show inline error with Enable option
        setGenerateLinkModal((prev) =>
          prev ? { ...prev, error: data.error || 'ShareView and/or Reports are not yet enabled.', needsEnable: !!data.requires } : null
        )
        return
      }
      if (!response.ok) throw new Error('Failed to generate link')
      setGenerateLinkModal(null)
      await fetchReports()
    } catch (err) {
      console.error('Error generating link:', err)
      setGenerateLinkModal((prev) =>
        prev ? { ...prev, error: err instanceof Error ? err.message : 'Failed to generate link' } : null
      )
    }
  }

  const handleEnableAndGenerate = async () => {
    if (!generateLinkModal) return
    const { report, expiresAt } = generateLinkModal
    setGenerateLinkModal((prev) => prev ? { ...prev, enabling: true, error: undefined } : null)
    try {
      // GET current config so we don't overwrite other feature flags
      const configRes = await fetch(`/api/config/${retailerId}`)
      if (!configRes.ok) throw new Error('Failed to load retailer config')
      const currentConfig = await configRes.json()

      const updatedFeatures = {
        ...(currentConfig.features_enabled || {}),
        can_access_shareview: true,
        enable_live_data: true,
        enable_reports: true,
      }

      const putRes = await fetch(`/api/config/${retailerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visible_tabs: currentConfig.visible_tabs,
          visible_metrics: currentConfig.visible_metrics,
          keyword_filters: currentConfig.keyword_filters,
          features_enabled: updatedFeatures,
        }),
      })
      if (!putRes.ok) throw new Error('Failed to update retailer settings')

      // Retry token creation
      const body: Record<string, unknown> = { report_id: report.id }
      if (expiresAt) body.expires_at = expiresAt
      const tokenRes = await fetch(`/api/retailers/${retailerId}/access-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!tokenRes.ok) throw new Error('Failed to generate link')

      setGenerateLinkModal(null)
      await fetchReports()
    } catch (err) {
      console.error('Error enabling ShareView and generating link:', err)
      setGenerateLinkModal((prev) =>
        prev ? { ...prev, enabling: false, error: err instanceof Error ? err.message : 'An error occurred' } : null
      )
    }
  }

  const renderDataStatusSelect = (report: ReportListItem) => {
    const isApproved = report.status === 'published'
    return (
      <select
        value={isApproved ? 'approved' : 'pending'}
        onChange={(e) => handleDataStatusChange(report, e.target.value as 'approved' | 'pending')}
        className={`px-2 py-1 text-xs font-medium rounded border cursor-pointer focus:outline-none ${
          isApproved
            ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
            : 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200'
        }`}
      >
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
      </select>
    )
  }

  const renderInsightStatusSelect = (report: ReportListItem) => {
    if (!report.include_insights) {
      return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded">—</span>
    }
    const isApproved = report.insight_status === 'approved'
    return (
      <select
        value={isApproved ? 'approved' : 'pending'}
        onChange={(e) => handleInsightStatusChange(report, e.target.value as 'approved' | 'pending')}
        className={`px-2 py-1 text-xs font-medium rounded border cursor-pointer focus:outline-none ${
          isApproved
            ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
            : 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200'
        }`}
      >
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
      </select>
    )
  }

  const getGenerationBadge = (reportType: string) => {
    switch (reportType) {
      case 'manual':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">Manual</span>
      case 'scheduled':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">Automatic</span>
      case 'client_generated':
        return <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded">Client</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">{reportType}</span>
    }
  }

  const getLinkCell = (report: ReportListItem) => {
    const isFullyApproved =
      report.status === 'published' &&
      (!report.include_insights || report.insight_status === 'approved')

    if (!isFullyApproved) {
      return <span className="text-xs text-gray-300">—</span>
    }

    const tokenInfo = report.token_info
    const isExpired = tokenInfo?.expires_at && new Date(tokenInfo.expires_at) < new Date()

    if (tokenInfo && !isExpired) {
      const daysLeft = tokenInfo.expires_at
        ? Math.ceil((new Date(tokenInfo.expires_at).getTime() - Date.now()) / 86_400_000)
        : null
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleCopyLink(report)}
              title="Copy link to clipboard"
              className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 rounded flex items-center gap-1"
            >
              <LinkIcon className="w-3 h-3" />
              {copiedId === report.id ? 'Copied!' : 'Copy link'}
            </button>
            <button
              onClick={() => handleDeactivateLink(report)}
              disabled={linkActionId === report.id}
              title="Delete link"
              className="px-1.5 py-1 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ×
            </button>
          </div>
          <span className="text-xs text-gray-500">
            {daysLeft !== null ? `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'Expires when deleted'}
          </span>
        </div>
      )
    }

    return (
      <button
        onClick={() =>
          setGenerateLinkModal({
            report,
            expiresAt: '',
          })
        }
        className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 rounded flex items-center gap-1"
      >
        <LinkIcon className="w-3 h-3" />
        {isExpired ? 'Regenerate link' : 'Generate link'}
      </button>
    )
  }

  if (loading && reports.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading reports...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Edit Modal */}
      {editingReport && (
        <SnapshotCreationModal
          retailerId={retailerId}
          retailerName={editingReport.retailer_name}
          periodStart={editingReport.period_start}
          periodEnd={editingReport.period_end}
          periodLabel={`${editingReport.period_start} – ${editingReport.period_end}`}
          periodType={editingReport.period_type}
          mode="edit"
          existingReport={{
            id: editingReport.id,
            title: editingReport.title || '',
            domains: editingReport.domains,
            include_insights: editingReport.include_insights,
            insights_require_approval: editingReport.insights_require_approval,
          }}
          onClose={() => setEditingReport(null)}
          onCreated={() => {
            setEditingReport(null)
            fetchReports()
          }}
        />
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDialog(null)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {confirmDialog.type === 'delete' ? 'Delete Report' : 'Archive Report'}
            </h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to {confirmDialog.type} &quot;{confirmDialog.reportTitle}&quot;?
              {confirmDialog.type === 'delete' && ' This action cannot be undone.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.type === 'delete') {
                    handleDelete(confirmDialog.reportId)
                  } else {
                    handleArchive(confirmDialog.reportId)
                  }
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                  confirmDialog.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirmDialog.type === 'delete' ? 'Delete' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Heading row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {showArchived ? 'Showing archived reports' : 'Showing active reports'}
        </span>
        <button
          onClick={() => setShowArchived((prev) => !prev)}
          className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600"
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-gray-500 text-lg mb-2">
            {showArchived ? 'No archived reports' : 'No snapshot reports yet'}
          </p>
          <p className="text-gray-400 text-sm">
            {showArchived
              ? 'Archived reports will appear here'
              : 'Create a snapshot report from the Live Data section'}
          </p>
        </div>
      ) : (
        /* Table */
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Report Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Generation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Insights Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Link
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reports.map((report) => {
                const insightStatus = report.insight_status
                const isFullyApproved =
                  report.status === 'published' &&
                  (!report.include_insights || insightStatus === 'approved')

                return (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/retailer/${report.retailer_id}/reports/${report.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                          >
                            {report.title || `Report ${report.id}`}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                          {isFullyApproved && !report.hidden_from_retailer && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-700 rounded-full">
                              Published
                            </span>
                          )}
                          {isFullyApproved && report.hidden_from_retailer && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500 rounded-full">
                              Retracted
                            </span>
                          )}
                          {report.is_archived && (
                            <span className="px-2 py-0.5 text-xs text-gray-400">[Archived]</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Created {new Date(report.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getGenerationBadge(report.report_type)}
                    </td>
                    <td className="px-6 py-4">
                      {renderDataStatusSelect(report)}
                    </td>
                    <td className="px-6 py-4">
                      {renderInsightStatusSelect(report)}
                    </td>
                    <td className="px-6 py-4">
                      {getLinkCell(report)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingReport(report)}
                          title="Edit report name and settings"
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                        >
                          {/* Pencil icon inline to avoid import clash */}
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            <path d="m15 5 4 4"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleToggleVisibility(report)}
                          disabled={!isFullyApproved}
                          title={
                            !isFullyApproved
                              ? 'Report must be fully approved before changing visibility'
                              : report.hidden_from_retailer
                                ? 'Report hidden from retailer – click to show'
                                : 'Report visible to retailer – click to hide'
                          }
                          className={`p-1.5 rounded ${
                            !isFullyApproved
                              ? 'opacity-50 cursor-not-allowed text-gray-400'
                              : 'text-purple-600 hover:text-purple-800 hover:bg-purple-50'
                          }`}
                        >
                          {report.hidden_from_retailer ? (
                            <EyeOff className="w-4 h-4 text-gray-400" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleRegenerate(report.id)}
                          disabled={regeneratingId === report.id}
                          title="Create a new report on the latest data – data and insights will need to be re-approved"
                          className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-4 h-4 ${regeneratingId === report.id ? 'animate-spin' : ''}`} />
                        </button>
                        {!report.is_archived && (
                          <button
                            onClick={() => setConfirmDialog({ type: 'archive', reportId: report.id, reportTitle: report.title || `Report ${report.id}` })}
                            title="Move to archive"
                            className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDialog({ type: 'delete', reportId: report.id, reportTitle: report.title || `Report ${report.id}` })}
                          title="Permanently delete the report"
                          className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate Link Modal */}
      {generateLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !generateLinkModal.enabling && setGenerateLinkModal(null)}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Generate Report Link</h3>
              <button
                onClick={() => setGenerateLinkModal(null)}
                disabled={generateLinkModal.enabling}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
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
                  value={generateLinkModal.expiresAt}
                  onChange={(e) =>
                    setGenerateLinkModal((prev) => prev ? { ...prev, expiresAt: e.target.value } : null)
                  }
                  disabled={generateLinkModal.enabling}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 disabled:opacity-50"
                  min={new Date().toISOString().split('T')[0]}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank for no expiry (link will only expire when deleted)
                </p>
              </div>
              {generateLinkModal.error && (
                <p className="text-sm font-medium text-red-600">
                  {generateLinkModal.error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setGenerateLinkModal(null)}
                disabled={generateLinkModal.enabling}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={generateLinkModal.needsEnable ? handleEnableAndGenerate : handleGenerateModalLink}
                disabled={generateLinkModal.enabling}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-md disabled:opacity-70"
              >
                {generateLinkModal.enabling
                  ? 'Enabling…'
                  : generateLinkModal.needsEnable
                    ? 'Enable and generate link'
                    : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

