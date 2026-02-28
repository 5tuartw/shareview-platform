'use client'

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export type PeriodType = 'month' | 'week' | 'custom'

export interface DateRangeState {
  periodType: PeriodType
  period: string
  start: string
  end: string
}

interface DateRangeContextValue extends DateRangeState {
  setPeriod: (period: string) => void
  setPeriodType: (periodType: PeriodType) => void
  setCustomRange: (start: string, end: string) => void
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null)

const getMonthStart = (period: string): string => `${period}-01`

const getMonthEnd = (period: string): string => {
  const [year, month] = period.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

const getDefaultPeriod = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface DateRangeProviderProps {
  children: React.ReactNode
  /** When provided, the provider ignores URL params and does not sync back to the URL. */
  initialPeriodType?: PeriodType
  initialPeriod?: string
  initialStart?: string
  initialEnd?: string
}

export function DateRangeProvider({
  children,
  initialPeriodType,
  initialPeriod,
  initialStart,
  initialEnd,
}: DateRangeProviderProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasInitialised = useRef(false)

  // When initial values are passed in, the period is "frozen" – we don't read
  // URL params and we don't push period changes back to the URL.
  const frozen = !!(initialPeriod || initialStart)

  const [periodType, setPeriodTypeState] = useState<PeriodType>(initialPeriodType ?? 'month')
  const [period, setPeriodState] = useState(initialPeriod ?? getDefaultPeriod())
  const [start, setStart] = useState(initialStart ?? getMonthStart(initialPeriod ?? getDefaultPeriod()))
  const [end, setEnd] = useState(initialEnd ?? getMonthEnd(initialPeriod ?? getDefaultPeriod()))

  useEffect(() => {
    return () => {
      hasInitialised.current = false
    }
  }, [])

  // URL-param initialisation – skipped in frozen mode
  useEffect(() => {
    if (frozen) return
    if (hasInitialised.current) return

    const paramPeriodType = (searchParams.get('periodType') as PeriodType) || 'month'
    const paramPeriod = searchParams.get('period') || getDefaultPeriod()
    const paramStart = searchParams.get('start') || getMonthStart(paramPeriod)
    const paramEnd = searchParams.get('end') || getMonthEnd(paramPeriod)

    if (paramPeriodType === 'custom') {
      setPeriodTypeState('custom')
      setPeriodState(paramPeriod)
      setStart(paramStart)
      setEnd(paramEnd)
    } else {
      setPeriodTypeState(paramPeriodType)
      setPeriodState(paramPeriod)
      setStart(getMonthStart(paramPeriod))
      setEnd(getMonthEnd(paramPeriod))
    }

    hasInitialised.current = true
  }, [frozen, searchParams])

  // URL-param syncing – skipped in frozen mode
  useEffect(() => {
    if (frozen) return
    if (!hasInitialised.current) return

    const params = new URLSearchParams(searchParams.toString())
    params.set('periodType', periodType)
    params.set('period', period)

    if (periodType === 'custom') {
      params.set('start', start)
      params.set('end', end)
    } else {
      params.delete('start')
      params.delete('end')
    }

    const nextParams = params.toString()
    const currentParams = searchParams.toString()
    if (nextParams !== currentParams) {
      router.replace(`?${nextParams}`)
    }
  }, [periodType, period, start, end, router, searchParams])

  const setPeriod = (nextPeriod: string) => {
    setPeriodState(nextPeriod)
    setPeriodTypeState('month')
    setStart(getMonthStart(nextPeriod))
    setEnd(getMonthEnd(nextPeriod))
  }

  const setPeriodType = (nextType: PeriodType) => {
    setPeriodTypeState(nextType)
    if (nextType !== 'custom') {
      setStart(getMonthStart(period))
      setEnd(getMonthEnd(period))
    }
  }

  const setCustomRange = (nextStart: string, nextEnd: string) => {
    setPeriodTypeState('custom')
    setStart(nextStart)
    setEnd(nextEnd)
  }

  const value = useMemo(
    () => ({
      periodType,
      period,
      start,
      end,
      setPeriod,
      setPeriodType,
      setCustomRange,
    }),
    [periodType, period, start, end]
  )

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}

export function useDateRange() {
  const context = useContext(DateRangeContext)
  if (!context) {
    throw new Error('useDateRange must be used within a DateRangeProvider')
  }
  return context
}
