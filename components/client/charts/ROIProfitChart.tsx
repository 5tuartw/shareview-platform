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

interface ROIProfitChartProps {
  data: Array<{ label: string; roi: number | null; profit: number | null }>
  showROI?: boolean
  showProfit?: boolean
  highlightStart?: string
  highlightEnd?: string
  highlightX?: string
}

export default function ROIProfitChart({
  data,
  showROI = true,
  showProfit = true,
  highlightStart,
  highlightEnd,
  highlightX,
}: ROIProfitChartProps) {
  const shouldShowROI = showROI
  const shouldShowProfit = showProfit
  const isDualSeries = shouldShowROI && shouldShowProfit

  if (!shouldShowROI && !shouldShowProfit) {
    return null
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: shouldShowROI ? COLORS.chartWarning : COLORS.chartCritical }}
          stroke={shouldShowROI ? COLORS.chartWarning : COLORS.chartCritical}
          tickFormatter={shouldShowROI ? (value) => `${value}%` : (value) => formatCurrency(value as number)}
        />
        {isDualSeries && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: COLORS.chartCritical }}
            stroke={COLORS.chartCritical}
            tickFormatter={(value) => formatCurrency(value as number)}
          />
        )}
        <Tooltip />
        <Legend
          content={({ payload }) => {
            const entries = Array.isArray(payload)
              ? payload.filter((entry) => {
                  if (entry.value === 'ROI %') return shouldShowROI
                  if (entry.value === 'Profit') return shouldShowProfit
                  return false
                })
              : []
            const sorted = entries.sort((a, b) => {
              const order = ['ROI %', 'Profit']
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
        {shouldShowROI && (
          <Line
            yAxisId="left"
            type="monotone"
            name="ROI %"
            dataKey="roi"
            stroke={COLORS.chartWarning}
            strokeWidth={2}
            dot={false}
          />
        )}
        {shouldShowProfit && (
          <Line
            yAxisId={isDualSeries ? 'right' : 'left'}
            type="monotone"
            name="Profit"
            dataKey="profit"
            stroke={COLORS.chartCritical}
            strokeWidth={2}
            dot={false}
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
