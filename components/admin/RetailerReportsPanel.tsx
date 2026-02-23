'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { ReportListItem } from '@/types'

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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogType>(null)
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null)

  const fetchReports = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/reports?retailerId=${retailerId}`)
      
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
  }

  useEffect(() => {
    fetchReports()
  }, [retailerId])

  const handleStartEdit = (report: ReportListItem) => {
    setEditingId(report.id)
    setEditingTitle(report.title || '')
  }

  const handleSaveEdit = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitle }),
      })

      if (!response.ok) {
        throw new Error('Failed to update report title')
      }

      setEditingId(null)
      setEditingTitle('')
      await fetchReports()
    } catch (err) {
      console.error('Error updating title:', err)
      alert('Failed to update report title')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const handleArchive = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
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

  const getDataStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">Available</span>
      case 'draft':
      case 'pending_approval':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">Pending approval</span>
      case 'archived':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">Archived</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">{status}</span>
    }
  }

  const getInsightStatusBadge = (insightStatus: string | null | undefined) => {
    if (insightStatus === 'approved') {
      return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">Available</span>
    }
    if (insightStatus === 'pending') {
      return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">Pending approval</span>
    }
    return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">Insights disabled</span>
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

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-gray-500 text-lg mb-2">No snapshot reports yet</p>
        <p className="text-gray-400 text-sm">
          Create a snapshot report from the Live Data section
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDialog(null)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {confirmDialog.type === 'delete' ? 'Delete Report' : 'Archive Report'}
            </h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to {confirmDialog.type} "{confirmDialog.reportTitle}"?
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

      {/* Table */}
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
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  {editingId === report.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveEdit(report.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(report.id)
                        if (e.key === 'Escape') handleCancelEdit()
                      }}
                      autoFocus
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  ) : (
                    <div>
                      <Link
                        href={`/retailer/${report.retailer_id}/reports/${report.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {report.title || `Report ${report.id}`}
                      </Link>
                      <div className="text-xs text-gray-500 mt-1">
                        Created {new Date(report.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {getGenerationBadge(report.report_type)}
                </td>
                <td className="px-6 py-4">
                  {getDataStatusBadge(report.status)}
                </td>
                <td className="px-6 py-4">
                  {getInsightStatusBadge(report.insight_status)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleStartEdit(report)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                      disabled={editingId !== null}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDialog({ type: 'archive', reportId: report.id, reportTitle: report.title || `Report ${report.id}` })}
                      className="text-xs text-amber-600 hover:text-amber-800"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => setConfirmDialog({ type: 'delete', reportId: report.id, reportTitle: report.title || `Report ${report.id}` })}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => handleToggleVisibility(report)}
                      className="text-xs text-purple-600 hover:text-purple-800"
                    >
                      {report.hidden_from_retailer ? 'Show to retailer' : 'Hide from retailer'}
                    </button>
                    <button
                      onClick={() => handleRegenerate(report.id)}
                      disabled={regeneratingId === report.id}
                      className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {regeneratingId === report.id ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
