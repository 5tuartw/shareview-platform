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

interface CVRChartProps {
  data: Array<{ label: string; cvr: number | null }>
  highlightStart?: string
  highlightEnd?: string
  highlightX?: string
}

export default function CVRChart({ data, highlightStart, highlightEnd, highlightX }: CVRChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          tick={{ fontSize: 11, fill: COLORS.chartWarning }}
          stroke={COLORS.chartWarning}
          tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
        />
        <Tooltip formatter={(value) => (value == null ? 'No data' : `${Number(value).toFixed(2)}%`)} />
        <Line
          type="monotone"
          name="CVR %"
          dataKey="cvr"
          stroke={COLORS.chartWarning}
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
