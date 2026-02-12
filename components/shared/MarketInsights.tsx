import React from 'react'
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { COLORS } from '@/lib/colors'

interface InsightItem {
  metric: string
  value: string | number
  comparison: string
  status: 'good' | 'neutral' | 'warning'
}

interface MarketInsightsProps {
  insights: InsightItem[]
  title?: string
  disclaimer?: string
}

export default function MarketInsights({
  insights,
  title = 'Market Insights',
  disclaimer = 'Compared to category averages based on November 2025 data',
}: MarketInsightsProps) {
  const getStatusConfig = (status: InsightItem['status']) => {
    switch (status) {
      case 'good':
        return {
          icon: TrendingUp,
          color: COLORS.success,
          bgColor: COLORS.successBg,
        }
      case 'warning':
        return {
          icon: TrendingDown,
          color: COLORS.warning,
          bgColor: COLORS.warningBg,
        }
      case 'neutral':
      default:
        return {
          icon: Minus,
          color: COLORS.textMuted,
          bgColor: '#F9FAFB',
        }
    }
  }

  return (
    <div 
      className="bg-white border-2 rounded-lg overflow-hidden"
      style={{ borderColor: COLORS.success }}
    >
      <div 
        className="px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: COLORS.successBg }}
      >
        <BarChart3 className="w-5 h-5" style={{ color: COLORS.successDark }} />
        <h4 className="font-semibold text-lg" style={{ color: COLORS.successDark }}>
          {title}
        </h4>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight, idx) => {
            const config = getStatusConfig(insight.status)
            const StatusIcon = config.icon

            return (
              <div 
                key={idx}
                className="p-3 rounded-lg border"
                style={{ 
                  backgroundColor: config.bgColor,
                  borderColor: config.color,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium" style={{ color: COLORS.textMuted }}>
                    {insight.metric}
                  </span>
                  <StatusIcon className="w-4 h-4" style={{ color: config.color }} />
                </div>
                <div className="text-xl font-bold mb-1" style={{ color: COLORS.textPrimary }}>
                  {insight.value}
                </div>
                <div className="text-xs" style={{ color: COLORS.textSecondary }}>
                  {insight.comparison}
                </div>
              </div>
            )
          })}
        </div>

        {disclaimer && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              <strong>Note:</strong> {disclaimer}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}