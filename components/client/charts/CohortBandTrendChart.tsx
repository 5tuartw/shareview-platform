'use client'

import type { ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COLORS } from '@/lib/colors'

type CohortBandTrendPoint = {
  periodKey: string
  label: string
  retailer: number | null
  cohortMedian: number | null
  cohortP25: number | null
  cohortP75: number | null
}

interface CohortBandTrendChartProps {
  data: CohortBandTrendPoint[]
  height?: number
  valueFormatter: (value: number | null | undefined) => string
  yTickFormatter?: (value: unknown) => string
  labelFormatter?: (label: unknown, payload?: ReadonlyArray<{ payload?: { periodKey?: string } }>) => ReactNode
}

export default function CohortBandTrendChart({
  data,
  height = 220,
  valueFormatter,
  yTickFormatter,
  labelFormatter,
}: CohortBandTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#9CA3AF"
          tickFormatter={(value) => {
            if (yTickFormatter) return yTickFormatter(value)
            const numeric = Number(value)
            return Number.isNaN(numeric) ? '' : valueFormatter(numeric)
          }}
        />
        <Tooltip
          labelFormatter={labelFormatter}
          formatter={(value) => {
            if (value === null || value === undefined) return valueFormatter(null)
            const numeric = Number(value)
            return valueFormatter(Number.isNaN(numeric) ? null : numeric)
          }}
          contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
        />
        <Area type="monotone" dataKey="cohortP75" name="Cohort P75" stroke="none" fill="#CBD5E1" fillOpacity={0.6} connectNulls />
        <Area type="monotone" dataKey="cohortP25" name="Cohort P25" stroke="none" fill="#FFFFFF" fillOpacity={1} connectNulls />
        <Line type="monotone" dataKey="cohortP25" name="Cohort P25 (line)" stroke="#94A3B8" strokeWidth={1} dot={false} strokeDasharray="2 4" connectNulls />
        <Line type="monotone" dataKey="cohortP75" name="Cohort P75 (line)" stroke="#94A3B8" strokeWidth={1} dot={false} strokeDasharray="2 4" connectNulls />
        <Line type="monotone" dataKey="retailer" name="You" stroke={COLORS.warning} strokeWidth={2.5} dot={false} connectNulls />
        <Line type="monotone" dataKey="cohortMedian" name="Cohort median" stroke={COLORS.success} strokeWidth={2} dot={false} strokeDasharray="6 3" connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
