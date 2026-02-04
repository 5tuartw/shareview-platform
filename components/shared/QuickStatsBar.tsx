import React from 'react'
import { COLORS } from '@/lib/colors'

interface QuickStatItem {
  label: string
  value: number | string
  color?: string
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
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
