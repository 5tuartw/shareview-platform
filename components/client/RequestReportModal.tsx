'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface RequestReportModalProps {
  isOpen: boolean
  retailerId: string
  domain: string
  onClose: () => void
  onSuccess: () => void
}

export default function RequestReportModal({
  isOpen,
  retailerId,
  domain,
  onClose,
  onSuccess,
}: RequestReportModalProps) {
  const [period, setPeriod] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!period) {
      setError('Please select a period')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch('/api/reports/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailer_id: retailerId,
          period,
          title: `${domain.charAt(0).toUpperCase() + domain.slice(1)} Report`,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to request report')
      }

      // Success
      setPeriod('')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request report')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setPeriod('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50">
      <div className="relative w-full max-w-md mx-4 my-8 bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Request a Report</h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Select the month for which you'd like to request a report
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-[#F59E0B] text-white rounded-md hover:bg-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>

          {submitting && (
            <div className="pt-2">
              <p className="text-sm text-gray-600 text-center">
                Your report has been requested. You'll be notified when it's ready.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
