import React from 'react'
import { InsightSeverity } from './types'
import { Target, DollarSign, TrendingUp, CheckCircle } from 'lucide-react'

interface InsightPanelProps {
  severity: InsightSeverity
  title: string
  summary: string
  details: string[]
  actions: string[]
  estimatedValue?: string
}

const severityStyles: Record<
  InsightSeverity,
  {
    bg: string
    border: string
    icon: React.ReactNode
    badge: string
    badgeBg: string
  }
> = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    icon: <Target className="w-6 h-6 text-red-600" />,
    badge: 'COMPETITIVE INSIGHT',
    badgeBg: 'bg-red-100 text-red-800',
  },
  warning: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    icon: <DollarSign className="w-6 h-6 text-orange-600" />,
    badge: 'EFFICIENCY INSIGHT',
    badgeBg: 'bg-orange-100 text-orange-800',
  },
  opportunity: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    icon: <TrendingUp className="w-6 h-6 text-blue-600" />,
    badge: 'OPPORTUNITY',
    badgeBg: 'bg-blue-100 text-blue-800',
  },
  strength: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    icon: <CheckCircle className="w-6 h-6 text-green-600" />,
    badge: 'COMPETITIVE STRENGTH',
    badgeBg: 'bg-green-100 text-green-800',
  },
}

export default function InsightPanel({
  severity,
  title,
  summary,
  details,
  actions,
  estimatedValue,
}: InsightPanelProps) {
  const style = severityStyles[severity]

  return (
    <div className={`${style.bg} ${style.border} border-2 rounded-lg p-6 mb-6`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          {style.icon}
          <div>
            <span className={`${style.badgeBg} text-xs font-bold px-2 py-1 rounded`}>{style.badge}</span>
            <h3 className="text-lg font-bold text-[#1C1D1C] mt-2">{title}</h3>
          </div>
        </div>
        {estimatedValue && (
          <div className="text-right">
            <div className="text-sm text-gray-600">Estimated Value</div>
            <div className="text-2xl font-bold text-green-600">{estimatedValue}</div>
          </div>
        )}
      </div>

      <p className="text-base text-gray-700 mb-4 font-medium">{summary}</p>

      {details.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">What This Means:</h4>
          <ul className="space-y-2">
            {details.map((detail, idx) => (
              <li key={idx} className="text-sm text-gray-600 flex items-start">
                <span className="mr-2">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div className="border-t border-gray-300 pt-4 mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Recommended Actions:</h4>
          <ol className="space-y-2">
            {actions.map((action, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start">
                <span className="mr-2 font-semibold">{idx + 1}.</span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
