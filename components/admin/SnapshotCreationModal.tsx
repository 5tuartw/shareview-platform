'use client'

import { useState } from 'react'

interface SnapshotCreationModalProps {
  retailerId: string
  retailerName: string
  periodStart: string
  periodEnd: string
  periodLabel: string
  periodType: string
  onClose: () => void
  onCreated: (reportId: number) => void
  mode?: 'create' | 'edit'
  defaultDomains?: string[]
  existingReport?: {
    id: number
    title: string
    domains: string[]
    include_insights: boolean
    insights_require_approval: boolean
  }
}

export default function SnapshotCreationModal({
  retailerId,
  retailerName,
  periodStart,
  periodEnd,
  periodLabel,
  periodType,
  onClose,
  onCreated,
  mode = 'create',
  defaultDomains,
  existingReport,
}: SnapshotCreationModalProps) {
  const isEdit = mode === 'edit'

  const allDomains = ['overview', 'keywords', 'categories', 'products', 'auctions']
  const domainLabels: Record<string, string> = {
    overview: 'Overview',
    keywords: 'Search Terms',
    categories: 'Categories',
    products: 'Products',
    auctions: 'Auctions',
  }

  const [title, setTitle] = useState(
    isEdit && existingReport ? existingReport.title : `${retailerName} – ${periodLabel}`
  )
  const [selectedDomains, setSelectedDomains] = useState<string[]>(
    isEdit && existingReport ? existingReport.domains : (defaultDomains ?? [...allDomains])
  )
  const [includeInsights, setIncludeInsights] = useState(
    isEdit && existingReport ? existingReport.include_insights : false
  )
  const [insightsRequireApproval, setInsightsRequireApproval] = useState(
    isEdit && existingReport ? existingReport.insights_require_approval : true
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleDomain = (domain: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    )
  }

  const handleSubmit = async () => {
    if (selectedDomains.length === 0) {
      setError('Please select at least one section.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isEdit && existingReport) {
        // Edit mode: PATCH the existing report
        const response = await fetch(`/api/reports/${existingReport.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            domains: selectedDomains,
            include_insights: includeInsights,
            insights_require_approval: insightsRequireApproval,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to update snapshot report')
        }

        onCreated(existingReport.id)
      } else {
        // Create mode: POST a new report
        const reportPeriodType =
          periodType === 'month' ? 'monthly'
          : periodType === 'week' ? 'weekly'
          : 'custom'

        const response = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            retailer_id: retailerId,
            period_start: periodStart,
            period_end: periodEnd,
            period_type: reportPeriodType,
            title,
            domains: selectedDomains,
            include_insights: includeInsights,
            insights_require_approval: insightsRequireApproval,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create snapshot report')
        }

        const report = await response.json()
        onCreated(report.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="bg-[#1C1D1C] text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-xl font-semibold">
            {isEdit ? 'Edit Snapshot Report' : 'Create Snapshot Report'}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-6">
          {/* Report Name Input */}
          <div>
            <label
              htmlFor="report-name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Report Name
            </label>
            <input
              id="report-name"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-gray-900"
              disabled={loading}
            />
          </div>

          {/* Domain Checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Included Sections
            </label>
            <div className="flex flex-wrap gap-3">
              {allDomains.map((domain) => (
                <label
                  key={domain}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={selectedDomains.includes(domain)}
                    onChange={() => toggleDomain(domain)}
                    disabled={loading}
                    className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-700">{domainLabels[domain] || domain}</span>
                </label>
              ))}
            </div>
            {selectedDomains.length === 0 && (
              <p className="mt-1 text-xs text-red-600">At least one section must be selected.</p>
            )}
          </div>

          {/* AI Insights Toggles */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">AI Insights</label>

            {/* Include Insights */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Include AI insights</span>
              <button
                type="button"
                role="switch"
                aria-checked={includeInsights}
                onClick={() => setIncludeInsights((prev) => !prev)}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                  includeInsights ? 'bg-amber-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    includeInsights ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Insights Require Approval */}
            <div className="flex items-center justify-between">
              <span className={`text-sm ${includeInsights ? 'text-gray-700' : 'text-gray-400'}`}>
                AI insights require approval
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={insightsRequireApproval}
                onClick={() => setInsightsRequireApproval((prev) => !prev)}
                disabled={loading || !includeInsights}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                  insightsRequireApproval && includeInsights ? 'bg-amber-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    insightsRequireApproval && includeInsights ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Period Display (create mode only) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
              <div className="text-gray-900">{periodLabel}</div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !title.trim() || selectedDomains.length === 0}
            className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {loading
              ? isEdit
                ? 'Saving...'
                : 'Creating...'
              : isEdit
                ? 'Save changes'
                : 'Create snapshot'}
          </button>
        </div>
      </div>
    </div>
  )
}
