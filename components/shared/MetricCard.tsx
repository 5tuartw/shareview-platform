import React from 'react'
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react'
import { COLORS } from '@/lib/colors'

interface MetricCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  changeUnit?: '%' | 'pp' | ''  // %, percentage points, or no unit
  status?: 'success' | 'warning' | 'critical' | 'neutral'
  subtitle?: string
  icon?: LucideIcon
}

const TREND_CONFIG = {
  success: {
    icon: TrendingUp,
    color: COLORS.success,
  },
  warning: {
    icon: TrendingDown,
    color: COLORS.warning,
  },
  critical: {
    icon: TrendingDown,
    color: COLORS.critical,
  },
  neutral: {
    icon: Minus,
    color: '#6B7280', // gray-500
  },
}

export default function MetricCard({
  label,
  value,
  change,
  changeLabel = 'vs last month',
  changeUnit = '%',
  status = 'neutral',
  subtitle,
  icon: CustomIcon,
}: MetricCardProps) {
  const trendConfig = TREND_CONFIG[status]
  const TrendIcon = trendConfig.icon

  const formatChange = (val: number) => {
    const prefix = val > 0 ? '↑' : val < 0 ? '↓' : '↔'
    return `${prefix} ${Math.abs(val)}${changeUnit}`
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        {change !== undefined && (
          <TrendIcon className="w-4 h-4" style={{ color: trendConfig.color }} />
        )}
        {CustomIcon && !change && (
          <CustomIcon className="w-4 h-4 text-gray-400" />
        )}
      </div>
      <div className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>
        {value}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          <span 
            className="text-sm font-semibold" 
            style={{ color: status === 'neutral' ? '#6B7280' : trendConfig.color }}
          >
            {formatChange(change)}
          </span>
          <span className="text-xs text-gray-500">{changeLabel}</span>
        </div>
      )}
      {subtitle && !change && (
        <div className="mt-1">
          <span className="text-xs text-gray-500">{subtitle}</span>
        </div>
      )}
    </div>
  )
}
