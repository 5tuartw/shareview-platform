'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export type PeriodType = 'month' | 'week' | 'custom'
export type OverviewViewType = 'weekly' | 'monthly'

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
  // Overview-specific: view type, window size, and week anchor (kept separate from
  // `period` so that keywords/categories tabs always see a month-format period).
  overviewView: OverviewViewType
  setOverviewView: (v: OverviewViewType) => void
  windowSize: number
  setWindowSize: (n: number) => void
  weekPeriod: string
  setWeekPeriod: (p: string) => void
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

  // When initial values are passed in, the period is "frozen" – we don't read
  // URL params and we don't push period changes back to the URL.
  const frozen = !!(initialPeriod || initialStart)

  const paramPeriodType = ((searchParams.get('periodType') as PeriodType) || 'month')
  const paramPeriod = searchParams.get('period') || getDefaultPeriod()
  const paramStart = searchParams.get('start') || getMonthStart(paramPeriod)
  const paramEnd = searchParams.get('end') || getMonthEnd(paramPeriod)

  const resolvedInitialPeriodType: PeriodType = initialPeriodType ?? (frozen ? 'month' : paramPeriodType)
  const resolvedInitialPeriod = initialPeriod ?? (frozen ? getDefaultPeriod() : paramPeriod)
  const resolvedMonthStart = getMonthStart(resolvedInitialPeriod)
  const resolvedMonthEnd = getMonthEnd(resolvedInitialPeriod)
  const resolvedInitialStart = initialStart ?? (resolvedInitialPeriodType === 'custom' && !frozen ? paramStart : resolvedMonthStart)
  const resolvedInitialEnd = initialEnd ?? (resolvedInitialPeriodType === 'custom' && !frozen ? paramEnd : resolvedMonthEnd)

  const initialOverviewView: OverviewViewType = resolvedInitialPeriodType === 'week'
    ? 'weekly'
    : 'monthly'

  const [periodType, setPeriodTypeState] = useState<PeriodType>(resolvedInitialPeriodType)
  const [period, setPeriodState] = useState(resolvedInitialPeriod)
  const [start, setStart] = useState(resolvedInitialStart)
  const [end, setEnd] = useState(resolvedInitialEnd)
  const [overviewView, setOverviewViewState] = useState<OverviewViewType>(initialOverviewView)
  const [windowSize, setWindowSizeState] = useState<number>(13)
  const [weekPeriod, setWeekPeriodState] = useState<string>('')

  // URL-param syncing – skipped in frozen mode
  useEffect(() => {
    if (frozen) return

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
  }, [frozen, periodType, period, start, end, router, searchParams])

  const setPeriod = useCallback((nextPeriod: string) => {
    setPeriodState(nextPeriod)
    setPeriodTypeState('month')
    setStart(getMonthStart(nextPeriod))
    setEnd(getMonthEnd(nextPeriod))
  }, [])

  const setPeriodType = useCallback((nextType: PeriodType) => {
    setPeriodTypeState(nextType)
    if (nextType !== 'custom') {
      setStart(getMonthStart(period))
      setEnd(getMonthEnd(period))
    }
  }, [period])

  const setCustomRange = useCallback((nextStart: string, nextEnd: string) => {
    setPeriodTypeState('custom')
    setStart(nextStart)
    setEnd(nextEnd)
  }, [])

  const value = useMemo(
    () => ({
      periodType,
      period,
      start,
      end,
      setPeriod,
      setPeriodType,
      setCustomRange,
      overviewView,
      setOverviewView: setOverviewViewState,
      windowSize,
      setWindowSize: setWindowSizeState,
      weekPeriod,
      setWeekPeriod: setWeekPeriodState,
    }),
    [periodType, period, start, end, setCustomRange, setPeriod, setPeriodType, overviewView, windowSize, weekPeriod]
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
