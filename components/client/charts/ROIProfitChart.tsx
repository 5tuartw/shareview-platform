'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COLORS } from '@/lib/colors'
import { formatCurrency } from '@/lib/utils'

interface ROIProfitChartProps {
  data: Array<{ label: string; roi: number; profit: number }>
  highlightStart?: string
  highlightEnd?: string
}

export default function ROIProfitChart({ data, highlightStart, highlightEnd }: ROIProfitChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: COLORS.chartCritical }}
          stroke={COLORS.chartCritical}
          tickFormatter={(value) => formatCurrency(value as number)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: COLORS.chartWarning }}
          stroke={COLORS.chartWarning}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          name="Profit"
          dataKey="profit"
          stroke={COLORS.chartCritical}
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          name="ROI %"
          dataKey="roi"
          stroke={COLORS.chartWarning}
          strokeWidth={2}
          dot={false}
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
      </LineChart>
    </ResponsiveContainer>
  )
}
