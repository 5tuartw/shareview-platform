'use client'

import React, { useMemo } from 'react'
import DateRangeSelector from '@/components/shared/DateRangeSelector'
import { useDateRange } from '@/lib/contexts/DateRangeContext'

const buildMonthOptions = (monthsBack: number) => {
  const now = new Date()
  const options = [] as Array<{ value: string; label: string }>

  for (let i = 0; i < monthsBack; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    options.push({ value, label })
  }

  return options
}

export default function DateRangeSelectorWrapper() {
  const { period, setPeriod } = useDateRange()
  const availableMonths = useMemo(() => buildMonthOptions(12), [])

  return <DateRangeSelector selectedMonth={period} availableMonths={availableMonths} onChange={setPeriod} />
}
