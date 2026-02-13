import React from 'react'
import { Target, Zap, Lightbulb } from 'lucide-react'
import { COLORS } from '@/lib/colors'

interface InsightRow {
  insight: string
  shareightDoes?: string[]
  youCanDo?: string[]
  observationsAndActions?: string[]
}

interface InsightsPanelProps {
  title?: string
  insights?: InsightRow[]
  singleColumn?: boolean
}

const DEFAULT_INSIGHTS: InsightRow[] = [
  {
    insight: 'Beat rivals',
    observationsAndActions: [
      'Identify search terms where rivals dominate impressions',
      'Monitor competitor feed quality and pricing strategies',
    ],
  },
  {
    insight: 'Optimise spend',
    observationsAndActions: [
      'Reduce investment on low-intent, high-waste search terms generating lots of clicks but no conversions; add as negative search terms',
      'Review product availability for high-click, zero-conversion search terms',
    ],
  },
  {
    insight: 'Explore opportunities',
    observationsAndActions: [
      'Flag high-impression search terms where improved titles could drive clicks',
    ],
  },
]

const withAlpha = (hex: string, alpha: number) => {
  const parsed = hex.replace('#', '')
  const red = parseInt(parsed.slice(0, 2), 16)
  const green = parseInt(parsed.slice(2, 4), 16)
  const blue = parseInt(parsed.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

const INSIGHT_CONFIG = [
  {
    icon: Target,
    color: COLORS.blue,
    bgColor: COLORS.blueBg,
    glowColor: withAlpha(COLORS.blue, 0.3),
  },
  {
    icon: Zap,
    color: COLORS.success,
    bgColor: COLORS.successBg,
    glowColor: withAlpha(COLORS.success, 0.3),
  },
  {
    icon: Lightbulb,
    color: COLORS.warning,
    bgColor: COLORS.warningBg,
    glowColor: withAlpha(COLORS.warning, 0.3),
  },
]

export default function InsightsPanel({ 
  title = 'Strategic Insights', 
  insights = DEFAULT_INSIGHTS,
  singleColumn = true
}: InsightsPanelProps) {
  const useSingleColumn = singleColumn || (insights.length > 0 && insights[0].observationsAndActions !== undefined)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {/* Empty header for insight column */}
              </th>
              {useSingleColumn ? (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Observations and Actions
                </th>
              ) : (
                <>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    What SHAREIGHT does
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    What you can do
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {insights.map((row, idx) => {
              const config = INSIGHT_CONFIG[idx]
              const Icon = config.icon

              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="p-2.5 rounded-lg" 
                        style={{ 
                          backgroundColor: config.bgColor,
                          boxShadow: `0 0 20px ${config.glowColor}`
                        }}
                      >
                        <Icon className="w-5 h-5" style={{ color: config.color }} />
                      </div>
                      <span className="text-base font-bold text-gray-700">
                        {row.insight}
                      </span>
                    </div>
                  </td>
                  {useSingleColumn ? (
                    <td className="px-4 py-4">
                      <ul className="text-sm text-gray-600 space-y-1.5 list-disc pl-5">
                        {row.observationsAndActions?.map((item, itemIdx) => (
                          <li key={itemIdx}>{item}</li>
                        ))}
                      </ul>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-4">
                        <ul className="text-sm text-gray-600 space-y-1.5 list-disc pl-5">
                          {row.shareightDoes?.map((item, itemIdx) => (
                            <li key={itemIdx}>{item}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-4">
                        <ul className="text-sm text-gray-600 space-y-1.5 list-disc pl-5">
                          {row.youCanDo?.map((item, itemIdx) => (
                            <li key={itemIdx}>{item}</li>
                          ))}
                        </ul>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}