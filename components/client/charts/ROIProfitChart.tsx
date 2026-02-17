'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COLORS } from '@/lib/colors'
import { formatCurrency } from '@/lib/utils'

interface ROIProfitChartProps {
  data: Array<{ label: string; roi: number; profit: number }>
}

export default function ROIProfitChart({ data }: ROIProfitChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#9CA3AF" tickFormatter={(value) => `${value}%`} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          stroke="#9CA3AF"
          tickFormatter={(value) => formatCurrency(value as number)}
        />
        <Tooltip />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          name="ROI %"
          dataKey="roi"
          stroke={COLORS.chartWarning}
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          name="Profit"
          dataKey="profit"
          stroke={COLORS.chartCritical}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
