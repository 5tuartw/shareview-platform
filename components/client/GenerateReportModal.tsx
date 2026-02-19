'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

interface GenerateReportModalProps {
  isOpen: boolean
  retailerId: string
  domain: string
  onClose: () => void
  onReportGenerated: (reportId: number) => void
}

export default function GenerateReportModal({
  isOpen,
  retailerId,
  domain,
  onClose,
  onReportGenerated,
}: GenerateReportModalProps) {
  const [period, setPeriod] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!period) {
      setError('Please select a period')
      return
    }

    try {
      setGenerating(true)
      setError(null)

      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailer_id: retailerId,
          period,
          domains: [domain],
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate report')
      }

      const { report_id } = await response.json()
      setPeriod('')
      onReportGenerated(report_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
      setGenerating(false)
    }
  }

  const handleClose = () => {
    if (!generating) {
      setPeriod('')
      setError(null)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50">
      <div className="relative w-full max-w-md mx-4 my-8 bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Generate a Report</h2>
          {!generating && (
            <button
              onClick={handleClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-2">
              Period (YYYY-MM)
            </label>
            <input
              id="period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              disabled={generating}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B] disabled:bg-gray-100 disabled:cursor-not-allowed"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Select the month for which you'd like to generate a report
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {generating && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Generating report...</p>
                  <p className="text-xs text-blue-700 mt-1">
                    This may take a moment. Please don't close this window.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={generating}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating}
              className="px-4 py-2 bg-[#F59E0B] text-white rounded-md hover:bg-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {generating && <Loader2 className="w-4 h-4 animate-spin" />}
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
