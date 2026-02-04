import React from 'react'
import { Calendar } from 'lucide-react'
import { COLORS } from '@/lib/colors'

interface DateRangeSelectorProps {
  selectedMonth: string
  availableMonths: Array<{ value: string; label: string }>
  onChange: (month: string) => void
  showQuickSelect?: boolean
}

export default function DateRangeSelector({
  selectedMonth,
  availableMonths,
  onChange,
  showQuickSelect = false,
}: DateRangeSelectorProps) {
  if (!showQuickSelect) {
    // Simple month selector
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 inline-flex items-center gap-3">
        <Calendar className="w-5 h-5" style={{ color: COLORS.textSecondary }} />
        <div className="flex items-center gap-2">
          <select
            id="date-range"
            value={selectedMonth}
            onChange={(e) => onChange(e.target.value)}
            className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ color: COLORS.textPrimary }}
          >
            {availableMonths.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  // Extended version with quick selectors
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5" style={{ color: COLORS.textSecondary }} />
          <div className="flex items-center gap-2">
            <select
              id="date-range-full"
              value={selectedMonth}
              onChange={(e) => onChange(e.target.value)}
              className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ color: COLORS.textPrimary }}
            >
              {availableMonths.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
              <option value="custom" disabled>More dates coming soon...</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Quick select:</span>
          <button
            disabled
            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed"
          >
            Last 7 days
          </button>
          <button
            disabled
            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed"
          >
            Last 30 days
          </button>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> Date range filtering will be available soon.
        </p>
      </div>
    </div>
  )
}
