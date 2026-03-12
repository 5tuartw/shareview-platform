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

interface ImpressionsClicksChartProps {
  data: Array<{ label: string; impressions: number | null; clicks: number | null }>
  showImpressions?: boolean
  showClicks?: boolean
  highlightStart?: string
  highlightEnd?: string
  highlightX?: string
}

export default function ImpressionsClicksChart({
  data,
  showImpressions = true,
  showClicks = true,
  highlightStart,
  highlightEnd,
  highlightX,
}: ImpressionsClicksChartProps) {
  const shouldShowImpressions = showImpressions
  const shouldShowClicks = showClicks
  const isDualSeries = shouldShowImpressions && shouldShowClicks

  if (!shouldShowImpressions && !shouldShowClicks) {
    return null
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
        <YAxis
          yAxisId="left"
          tick={{
            fontSize: 11,
            fill: shouldShowImpressions ? COLORS.chartPrimary : COLORS.chartSecondary,
          }}
          stroke={shouldShowImpressions ? COLORS.chartPrimary : COLORS.chartSecondary}
        />
        {isDualSeries && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: COLORS.chartSecondary }}
            stroke={COLORS.chartSecondary}
          />
        )}
        <Tooltip />
        <Legend
          content={({ payload }) => {
            const entries = Array.isArray(payload)
              ? payload.filter((entry) => {
                  if (entry.value === 'Impressions') return shouldShowImpressions
                  if (entry.value === 'Clicks') return shouldShowClicks
                  return false
                })
              : []
            const sorted = entries.sort((a, b) => {
              const order = ['Impressions', 'Clicks']
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
        {shouldShowImpressions && (
          <Line
            yAxisId="left"
            type="monotone"
            name="Impressions"
            dataKey="impressions"
            stroke={COLORS.chartPrimary}
            strokeWidth={2}
            dot={false}
          />
        )}
        {shouldShowClicks && (
          <Line
            yAxisId={isDualSeries ? 'right' : 'left'}
            type="monotone"
            name="Clicks"
            dataKey="clicks"
            stroke={COLORS.chartSecondary}
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
