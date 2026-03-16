'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COLORS } from '@/lib/colors'
import { formatNumber } from '@/lib/utils'

interface ConversionsChartProps {
  data: Array<{ label: string; conversions: number | null }>
  highlightStart?: string
  highlightEnd?: string
  highlightX?: string
}

export default function ConversionsChart({ data, highlightStart, highlightEnd, highlightX }: ConversionsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          tick={{ fontSize: 11, fill: COLORS.chartPrimary }}
          stroke={COLORS.chartPrimary}
          tickFormatter={(value) => formatNumber(Number(value))}
        />
        <Tooltip formatter={(value) => (value == null ? 'No data' : formatNumber(Number(value)))} />
        <Line
          type="monotone"
          name="Conversions"
          dataKey="conversions"
          stroke={COLORS.chartPrimary}
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
        />
        {highlightStart && highlightEnd && (
          <ReferenceArea
            x1={highlightStart}
            x2={highlightEnd}
            fill="#F59E0B"
            fillOpacity={0.12}
            strokeOpacity={0}
          />
        )}
        {highlightX && (
          <ReferenceLine x={highlightX} stroke="#1C1D1C" strokeDasharray="4 3" strokeOpacity={0.7} />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
