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

interface ImpressionsClicksChartProps {
  data: Array<{ label: string; impressions: number; clicks: number }>
}

export default function ImpressionsClicksChart({ data }: ImpressionsClicksChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          name="Impressions"
          dataKey="impressions"
          stroke={COLORS.chartSecondary}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          name="Clicks"
          dataKey="clicks"
          stroke={COLORS.chartPrimary}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
