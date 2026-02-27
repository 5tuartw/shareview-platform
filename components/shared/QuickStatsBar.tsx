import React from 'react'
import { COLORS } from '@/lib/colors'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface QuickStatItem {
  label: string
  value: number | string
  color?: string
  change?: number | null
}

interface QuickStatsBarProps {
  items: QuickStatItem[]
}

export default function QuickStatsBar({ items }: QuickStatsBarProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div className="w-px h-12 bg-gray-300"></div>}
            <div className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-xs text-gray-600 leading-tight">{item.label}:</span>
              <span
                className="text-lg font-semibold"
                style={{ color: item.color || COLORS.textPrimary }}
              >
                {item.value}
              </span>
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
