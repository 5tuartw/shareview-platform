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

const formatProfitCurrency = (value: number): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

interface ROIProfitChartProps {
  data: Array<{ label: string; roi: number | null; profit: number | null }>
  highlightStart?: string
  highlightEnd?: string
  highlightX?: string
  showROI?: boolean
  showProfit?: boolean
}

export default function ROIProfitChart({ data, highlightStart, highlightEnd, highlightX, showROI = true, showProfit = true }: ROIProfitChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        {showROI && (
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: COLORS.chartWarning }}
            stroke={COLORS.chartWarning}
            tickFormatter={(value) => `${value}%`}
          />
        )}
        {showProfit && (
          <YAxis
            yAxisId="right"
            orientation={showROI ? 'right' : 'left'}
            tick={{ fontSize: 11, fill: COLORS.chartCritical }}
            stroke={COLORS.chartCritical}
            tickFormatter={(value) => formatProfitCurrency(value as number)}
          />
        )}
        <Tooltip
          formatter={(value, name) => {
            if (name === 'ROI %') return `${Number(value ?? 0).toFixed(1)}%`
            return formatProfitCurrency(Number(value) || 0)
          }}
        />
        <Legend
          content={({ payload }) => {
            const entries = Array.isArray(payload)
              ? payload.filter((entry) => entry.value === 'ROI %' || entry.value === 'Shareight Profit')
              : []
            const sorted = entries.sort((a, b) => {
              const order = ['ROI %', 'Shareight Profit']
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
        {showROI && (
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
        {showProfit && (
          <Line
            yAxisId="right"
            type="monotone"
            name="Shareight Profit"
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
