import React from 'react'
import { COLORS } from '@/lib/colors'
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'

interface QuickStatItem {
  label: string
  value: number | string
  color?: string
  change?: number | null
  subtitle?: string
  subtitleColor?: string
  tooltip?: string
}

interface QuickStatsBarProps {
  items: QuickStatItem[]
}

export default function QuickStatsBar({ items }: QuickStatsBarProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-0">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div className="w-px self-stretch bg-gray-300 mx-4 shrink-0"></div>}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="flex items-center gap-1 text-xs text-gray-600 leading-tight">
                <span>{item.label}:</span>
                {item.tooltip && (
                  <span title={item.tooltip} aria-label={item.tooltip} className="inline-flex items-center text-gray-500">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                )}
              </span>
              <span
                className="text-lg font-semibold"
                style={{ color: item.color || COLORS.textPrimary }}
              >
                {item.value}
              </span>
              {item.subtitle && (
                <span className="text-xs leading-tight" style={{ color: item.subtitleColor || '#9CA3AF' }}>
                  {item.subtitle}
                </span>
              )}
              {item.change != null && (
                <span className={`flex items-center gap-0.5 text-xs font-medium ${
                  item.change > 0 ? 'text-emerald-600' : item.change < 0 ? 'text-red-500' : 'text-gray-400'
                }`}>
                  {item.change > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : item.change < 0 ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : (
                    <Minus className="w-3 h-3" />
                  )}
                  {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                </span>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
