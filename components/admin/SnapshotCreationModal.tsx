'use client'

import { useState } from 'react'
import { useDateRange } from '@/lib/contexts/DateRangeContext'

interface SnapshotCreationModalProps {
  retailerId: string
  retailerName: string
  periodStart: string
  periodEnd: string
  periodLabel: string
  onClose: () => void
  onCreated: (reportId: number) => void
}

export default function SnapshotCreationModal({
  retailerId,
  retailerName,
  periodStart,
  periodEnd,
  periodLabel,
  onClose,
  onCreated,
}: SnapshotCreationModalProps) {
  const { periodType } = useDateRange()
  const [title, setTitle] = useState(`${retailerName} – ${periodLabel}`)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const domains = ['overview', 'keywords', 'categories', 'products', 'auctions']
  const domainLabels: Record<string, string> = {
    overview: 'Overview',
    keywords: 'Search Terms',
    categories: 'Categories',
    products: 'Products',
    auctions: 'Auctions',
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retailer_id: retailerId,
          period_start: periodStart,
          period_end: periodEnd,
          period_type: periodType,
          title,
          domains,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create snapshot report')
      }

      const report = await response.json()
      onCreated(report.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="bg-[#1C1D1C] text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-xl font-semibold">Create Snapshot Report</h2>
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

          {/* Domains Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Included Sections
            </label>
            <div className="flex flex-wrap gap-2">
              {domains.map((domain) => (
                <span
                  key={domain}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full border border-gray-300"
                >
                  {domainLabels[domain] || domain}
                </span>
              ))}
            </div>
          </div>

          {/* Period Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Period
            </label>
            <div className="text-gray-900">{periodLabel}</div>
          </div>

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
            disabled={loading || !title.trim()}
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
            {loading ? 'Creating...' : 'Create snapshot'}
          </button>
        </div>
      </div>
    </div>
  )
}
