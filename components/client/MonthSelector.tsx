'use client'

import { useEffect } from 'react'
import { useDateRange } from '@/lib/contexts/DateRangeContext'

interface MonthSelectorProps {
  availableMonths: string[]
}

export default function MonthSelector({ availableMonths }: MonthSelectorProps) {
  const { period, setPeriod } = useDateRange()

  const displayLabel = (() => {
    const date = new Date(`${period}-01`)
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  })()

  if (availableMonths.length === 0) {
    return (
      <span className="text-sm font-medium text-gray-700">{displayLabel}</span>
    )
  }

  const currentIdx = availableMonths.indexOf(period)

  // Normalise to the latest available month when the current period is absent from the list
  useEffect(() => {
    if (availableMonths.length > 0 && currentIdx === -1) {
      setPeriod(availableMonths[availableMonths.length - 1])
    }
  }, [availableMonths, currentIdx, setPeriod])

  const isFirst = currentIdx <= 0
  const isLast = currentIdx >= availableMonths.length - 1

  const handlePrev = () => {
    if (currentIdx > 0) {
      setPeriod(availableMonths[currentIdx - 1])
    }
  }

  const handleNext = () => {
    if (currentIdx < availableMonths.length - 1) {
      setPeriod(availableMonths[currentIdx + 1])
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handlePrev}
        disabled={isFirst}
        className="flex items-center justify-center w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous month"
      >
        &#8249;
      </button>
      <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">{displayLabel}</span>
      <button
        type="button"
        onClick={handleNext}
        disabled={isLast}
        className="flex items-center justify-center w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Next month"
      >
        &#8250;
      </button>
    </div>
  )
}
