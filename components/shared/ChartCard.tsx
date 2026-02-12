import React, { useState } from 'react'
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  ComposedChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine 
} from 'recharts'
import { COLORS } from '@/lib/colors'
import { CHART_GRID_STYLES, AXIS_STYLES, TOOLTIP_STYLES, LEGEND_STYLES } from '@/lib/chartConfig'

type ChartType = 'line' | 'bar' | 'composed'

interface ChartConfig {
  xAxis: string
  yAxis: string | string[]
  color?: string
  colors?: string[]
  showToggle?: boolean
  showZeroLine?: boolean
  yAxisId?: 'left' | 'right'
  secondYAxis?: {
    dataKey: string
    color: string
  }
  barRadius?: [number, number, number, number]
  strokeDasharray?: string
}

interface ChartCardProps {
  title: string
  subtitle?: string
  chartType: ChartType
  data: Array<Record<string, unknown>>
  config: ChartConfig
  height?: number
}

export default function ChartCard({
  title,
  subtitle,
  chartType: initialChartType,
  data,
  config,
  height = 280,
}: ChartCardProps) {
  const [chartType, setChartType] = useState<ChartType>(initialChartType)
  const [isLine, setIsLine] = useState(initialChartType === 'line')

  const toggleChartType = () => {
    setIsLine(!isLine)
    setChartType(isLine ? 'bar' : 'line')
  }

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 5, right: 5, left: 5, bottom: 5 },
    }

    if (chartType === 'line' || (isLine && initialChartType !== 'composed')) {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid {...CHART_GRID_STYLES} />
          <XAxis 
            dataKey={config.xAxis} 
            {...AXIS_STYLES.tick}
            tickLine={AXIS_STYLES.tickLine}
          />
          <YAxis 
            {...AXIS_STYLES.tick}
            tickLine={AXIS_STYLES.tickLine}
          />
          <Tooltip {...TOOLTIP_STYLES} />
          {Array.isArray(config.yAxis) ? (
            config.yAxis.map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={config.colors?.[idx] || config.color || COLORS.chartPrimary}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey={config.yAxis}
              stroke={config.color || COLORS.chartPrimary}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      )
    }

    if (chartType === 'bar') {
      return (
        <BarChart {...commonProps}>
          <CartesianGrid {...CHART_GRID_STYLES} />
          <XAxis 
            dataKey={config.xAxis} 
            {...AXIS_STYLES.tick}
            tickLine={AXIS_STYLES.tickLine}
          />
          <YAxis 
            {...AXIS_STYLES.tick}
            tickLine={AXIS_STYLES.tickLine}
          />
          <Tooltip {...TOOLTIP_STYLES} />
          {config.showZeroLine && (
            <ReferenceLine 
              y={0} 
              stroke={COLORS.critical} 
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}
          <Bar
            dataKey={config.yAxis as string}
            fill={config.color || COLORS.chartPrimary}
            radius={config.barRadius || [4, 4, 0, 0]}
          />
        </BarChart>
      )
    }

    if (chartType === 'composed') {
      return (
        <ComposedChart {...commonProps}>
          <CartesianGrid {...CHART_GRID_STYLES} />
          <XAxis 
            dataKey={config.xAxis} 
            {...AXIS_STYLES.tick}
            tickLine={AXIS_STYLES.tickLine}
          />
          <YAxis 
            yAxisId="left"
            {...AXIS_STYLES.tick}
            tickLine={AXIS_STYLES.tickLine}
          />
          {config.secondYAxis && (
            <YAxis 
              yAxisId="right"
              orientation="right"
              {...AXIS_STYLES.tick}
              tickLine={AXIS_STYLES.tickLine}
            />
          )}
          <Tooltip {...TOOLTIP_STYLES} />
          <Legend {...LEGEND_STYLES} />
          <Bar
            yAxisId="left"
            dataKey={config.yAxis as string}
            fill={config.color || COLORS.chartPrimary}
            fillOpacity={0.3}
            radius={[4, 4, 0, 0]}
          />
          {config.secondYAxis && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={config.secondYAxis.dataKey}
              stroke={config.secondYAxis.color}
              strokeWidth={3}
              dot={{ r: 5 }}
              activeDot={{ r: 7 }}
            />
          )}
        </ComposedChart>
      )
    }

    return null
  }

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        {config.showToggle && initialChartType !== 'composed' && (
          <button
            onClick={toggleChartType}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white hover:bg-gray-50"
          >
            {isLine ? (
              <>
                <BarChart3 className="w-4 h-4" />
                Bar
              </>
            ) : (
              <>
                <LineChartIcon className="w-4 h-4" />
                Line
              </>
            )}
          </button>
        )}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  )
}