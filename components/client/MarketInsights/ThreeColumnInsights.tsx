'use client'

import { useEffect, useState } from 'react'
import { fetchPageInsights } from '@/lib/api-client'
import { AlertCircle, TrendingUp, Lightbulb } from 'lucide-react'

interface InsightRow {
  insight: string
  observationsAndActions: string[]
  shareightDoes?: string[]
  youCanDo?: string[]
}

interface InsightsData {
  insight?: string
  title?: string
  rows: InsightRow[]
}

interface ThreeColumnInsightsProps {
  retailerId: string
  pageType: 'products' | 'categories' | 'auction'
}

export default function ThreeColumnInsights({ retailerId, pageType }: ThreeColumnInsightsProps) {
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInsights() {
      try {
        const data = await fetchPageInsights(retailerId, pageType, 'market_insights')
        if (data) {
          setInsights(data as unknown as InsightsData)
        }
      } catch (error) {
        console.error(`Failed to load ${pageType} market insights:`, error)
      } finally {
        setLoading(false)
      }
    }
    loadInsights()
  }, [retailerId, pageType])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center text-gray-500">Loading insights...</div>
      </div>
    )
  }

  if (!insights || !insights.rows || insights.rows.length === 0) {
    return null
  }

  const getIcon = (insight: string) => {
    if (insight.toLowerCase().includes('beat')) return <TrendingUp className="w-5 h-5 text-blue-600" />
    if (insight.toLowerCase().includes('spend') || insight.toLowerCase().includes('optimise')) {
      return <AlertCircle className="w-5 h-5 text-amber-600" />
    }
    return <Lightbulb className="w-5 h-5 text-green-600" />
  }

  const getColor = (insight: string) => {
    if (insight.toLowerCase().includes('beat')) return 'blue'
    if (insight.toLowerCase().includes('spend') || insight.toLowerCase().includes('optimise')) return 'amber'
    return 'green'
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h4 className="font-semibold text-gray-900 mb-6">
        {insights.insight || insights.title || 'Competitive Insights'}
      </h4>

      <div className="space-y-6">
        {insights.rows.map((row, idx) => {
          const color = getColor(row.insight)
          const observations =
            row.observationsAndActions || [...(row.shareightDoes || []), ...(row.youCanDo || [])]

          return (
            <div key={idx} className={`border-l-4 border-${color}-500 bg-${color}-50 p-4 rounded-r-lg`}>
              <h5 className={`font-medium text-${color}-900 mb-3 flex items-center gap-2`}>
                {getIcon(row.insight)}
                {row.insight}
              </h5>

              <div>
                <p className={`text-xs font-semibold text-${color}-800 uppercase mb-2`}>
                  Observations and Actions
                </p>
                <ul className={`text-sm text-${color}-700 space-y-1.5`}>
                  {observations.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
