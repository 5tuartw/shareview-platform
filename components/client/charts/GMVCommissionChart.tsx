'use client'

import {
  CartesianGrid,
  Legend,
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
import { formatCurrency } from '@/lib/utils'

interface GMVCommissionChartProps {
  data: Array<{ label: string; gmv: number | null; commission?: number | null }>
  showGMV?: boolean
  showCommission?: boolean
  highlightStart?: string
  highlightEnd?: string
  highlightX?: string
}

export default function GMVCommissionChart({
  data,
  showGMV = true,
  showCommission = true,
  highlightStart,
  highlightEnd,
  highlightX,
}: GMVCommissionChartProps) {
  const shouldShowGMV = showGMV
  const shouldShowCommission = showCommission
  const isDualSeries = shouldShowGMV && shouldShowCommission

  if (!shouldShowGMV && !shouldShowCommission) {
    return null
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: COLORS.chartPrimary }}
          stroke={COLORS.chartPrimary}
          tickFormatter={(value) => formatCurrency(value as number)}
        />
        {isDualSeries && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: COLORS.chartSecondary }}
            stroke={COLORS.chartSecondary}
            tickFormatter={(value) => formatCurrency(value as number)}
          />
        )}
        <Tooltip formatter={(value) => (value == null ? 'No data' : formatCurrency(Number(value)))} />
        <Legend
          content={({ payload }) => {
            const entries = Array.isArray(payload)
              ? payload.filter((entry) => {
                  if (entry.value === 'GMV') return shouldShowGMV
                  if (entry.value === 'Commission') return shouldShowCommission
                  return false
                })
              : []
            const sorted = entries.sort((a, b) => {
              const order = ['GMV', 'Commission']
              return order.indexOf(String(a.value)) - order.indexOf(String(b.value))
            })

            return (
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-gray-600">
                {sorted.map((entry) => (
                  <span key={String(entry.value)} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                    {String(entry.value)}
                  </span>
                ))}
              </div>
            )
          }}
        />
        {shouldShowGMV && (
          <Line
            yAxisId="left"
            type="monotone"
            name="GMV"
            dataKey="gmv"
            stroke={COLORS.chartPrimary}
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
        )}
        {shouldShowCommission && (
          <Line
            yAxisId={isDualSeries ? 'right' : 'left'}
            type="monotone"
            name="Commission"
            dataKey="commission"
            stroke={COLORS.chartSecondary}
            strokeWidth={2.5}
            dot={false}
            strokeDasharray="5 4"
            connectNulls={false}
          />
        )}
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
        {highlightX && (
          <ReferenceLine x={highlightX} stroke="#1C1D1C" strokeDasharray="4 3" strokeOpacity={0.7} />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
