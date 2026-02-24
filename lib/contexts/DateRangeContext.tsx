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

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasInitialised = useRef(false)

  const [periodType, setPeriodTypeState] = useState<PeriodType>('month')
  const [period, setPeriodState] = useState(getDefaultPeriod())
  const [start, setStart] = useState(getMonthStart(getDefaultPeriod()))
  const [end, setEnd] = useState(getMonthEnd(getDefaultPeriod()))

  useEffect(() => {
    return () => {
      hasInitialised.current = false
    }
  }, [])

  useEffect(() => {
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
  }, [searchParams])

  useEffect(() => {
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
