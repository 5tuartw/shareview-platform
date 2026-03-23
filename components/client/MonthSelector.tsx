'use client'

import { useEffect } from 'react'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import type { AvailableMonth } from '@/lib/analytics-shared'

interface MonthSelectorProps {
  availableMonths: AvailableMonth[]
}

export default function MonthSelector({ availableMonths }: MonthSelectorProps) {
  const { period, setPeriod } = useDateRange()

  const comparePeriods = (a: string, b: string): number => {
    if (a === b) return 0
    return a < b ? -1 : 1
  }

  const currentIdx = availableMonths.findIndex((month) => month.period === period)
  const selectedMonth = currentIdx >= 0 ? availableMonths[currentIdx] : null

  // Normalise to the nearest available month when the current period is absent from the list.
  // This keeps old requested periods usable by clamping to the earliest available period.
  useEffect(() => {
    if (availableMonths.length > 0 && currentIdx === -1) {
      const firstPeriod = availableMonths[0].period
      const lastPeriod = availableMonths[availableMonths.length - 1].period

      if (comparePeriods(period, firstPeriod) <= 0) {
        setPeriod(firstPeriod)
        return
      }

      if (comparePeriods(period, lastPeriod) >= 0) {
        setPeriod(lastPeriod)
        return
      }

      const nextAvailable = availableMonths.find((month) => comparePeriods(month.period, period) >= 0)
      setPeriod(nextAvailable?.period ?? lastPeriod)
    }
  }, [availableMonths, currentIdx, period, setPeriod])

  const displayLabel = (() => {
    const date = new Date(`${period}-01`)
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  })()

  if (availableMonths.length === 0) {
    return (
      <span className="text-sm font-medium text-gray-700">{displayLabel}</span>
    )
  }

  const isFirst = currentIdx <= 0
  const isLast = currentIdx >= availableMonths.length - 1

  const handlePrev = () => {
    if (currentIdx > 0) {
      setPeriod(availableMonths[currentIdx - 1].period)
    }
  }

  const handleNext = () => {
    if (currentIdx < availableMonths.length - 1) {
      setPeriod(availableMonths[currentIdx + 1].period)
    }
  }

  const formatNoteDate = (value: string): string => {
    const date = new Date(`${value}T00:00:00Z`)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const partialDataNote = (() => {
    if (!selectedMonth?.actualStart || !selectedMonth?.actualEnd) {
      return null
    }

    const [year, month] = selectedMonth.period.split('-').map(Number)
    const monthStart = new Date(Date.UTC(year, month - 1, 1))
    const monthEnd = new Date(Date.UTC(year, month, 0))
    const actualStart = new Date(`${selectedMonth.actualStart}T00:00:00Z`)
    const actualEnd = new Date(`${selectedMonth.actualEnd}T00:00:00Z`)

    const today = new Date()
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const isCurrentMonth =
      todayUtc.getUTCFullYear() === year && todayUtc.getUTCMonth() + 1 === month

    if (isCurrentMonth) {
      if (actualEnd < todayUtc) {
        return {
          className: 'text-xs text-gray-500 mt-1',
          text: `Data includes ${formatNoteDate(selectedMonth.actualStart)} to ${formatNoteDate(selectedMonth.actualEnd)}`,
        }
      }
      return null
    }

    if (actualStart > monthStart || actualEnd < monthEnd) {
      return {
        className: 'text-xs text-red-600 mt-1 font-medium',
        text: `⚠ Partial data only — ${formatNoteDate(selectedMonth.actualStart)} to ${formatNoteDate(selectedMonth.actualEnd)}`,
      }
    }

    return null
  })()

  return (
    <div className="flex flex-col items-end">
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
      {partialDataNote && <p className={partialDataNote.className}>{partialDataNote.text}</p>}
    </div>
  )
}
