'use client'

import { DateRangeProvider, type PeriodType } from '@/lib/contexts/DateRangeContext'

interface AccessShellProps {
  children: React.ReactNode
  periodType?: PeriodType
  period?: string
  start?: string
  end?: string
}

/**
 * Thin client wrapper used by the access/[token] server page.
 * Provides a DateRangeContext initialised to the report's period so all tabs
 * fetch data for the correct date range — ignoring any period params in the URL.
 */
export default function AccessShell({ children, periodType, period, start, end }: AccessShellProps) {
  return (
    <DateRangeProvider
      initialPeriodType={periodType}
      initialPeriod={period}
      initialStart={start}
      initialEnd={end}
    >
      {children}
    </DateRangeProvider>
  )
}
