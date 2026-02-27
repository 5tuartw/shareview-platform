'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COLORS } from '@/lib/colors'
import { formatCurrency } from '@/lib/utils'

interface GMVCommissionChartProps {
  data: Array<{ label: string; gmv: number; commission?: number }>
  highlightStart?: string
  highlightEnd?: string
}

export default function GMVCommissionChart({ data, highlightStart, highlightEnd }: GMVCommissionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: COLORS.chartPrimary }}
          stroke={COLORS.chartPrimary}
          tickFormatter={(value) => formatCurrency(value as number)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: COLORS.chartSecondary }}
          stroke={COLORS.chartSecondary}
          tickFormatter={(value) => formatCurrency(value as number)}
        />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Legend />
        <Bar yAxisId="left" name="GMV" dataKey="gmv" fill={COLORS.chartPrimary} radius={[4, 4, 0, 0]} />
        <Bar yAxisId="right" name="Commission" dataKey="commission" fill={COLORS.chartSecondary} radius={[4, 4, 0, 0]} />
        {highlightStart && highlightEnd && (
          <ReferenceArea
            yAxisId="left"
            x1={highlightStart}
            x2={highlightEnd}
            fill="#F59E0B"
            fillOpacity={0.12}
            strokeOpacity={0}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
