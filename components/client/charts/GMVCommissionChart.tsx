'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COLORS } from '@/lib/colors'
import { formatCurrency } from '@/lib/utils'

interface GMVCommissionChartProps {
  data: Array<{ label: string; gmv: number; commission?: number }>
}

export default function GMVCommissionChart({ data }: GMVCommissionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#9CA3AF"
          tickFormatter={(value) => formatCurrency(value as number)}
        />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Legend />
        <Bar name="GMV" dataKey="gmv" fill={COLORS.chartPrimary} radius={[4, 4, 0, 0]} />
        <Bar name="Commission" dataKey="commission" fill={COLORS.chartSecondary} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
