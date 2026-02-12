import React, { useEffect, useState } from 'react'
import BenchmarkCard from './BenchmarkCard'
import BenchmarkTable from './BenchmarkTable'
import InsightPanel from './InsightPanel'
import { Package, FileText, Ruler, Info } from 'lucide-react'
import { BenchmarkMetric } from './types'
import { fetchPageInsights } from '@/lib/api-client'

interface KeywordMarketInsightsProps {
  retailerId: string
}

interface Insight {
  severity: 'critical' | 'warning' | 'opportunity'
  title: string
  summary: string
  details: string[]
  actions: string[]
  estimatedValue: string
}

export default function KeywordMarketInsights({ retailerId }: KeywordMarketInsightsProps) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInsights() {
      try {
        const data = await fetchPageInsights(retailerId, 'keywords', 'market_insights')
        if (data && typeof data === 'object' && 'insights' in data) {
          setInsights((data as { insights?: Insight[] }).insights || [])
        }
      } catch (error) {
        console.error('Failed to load keyword market insights:', error)
      } finally {
        setLoading(false)
      }
    }
    loadInsights()
  }, [retailerId])

  const wordGapMetrics: BenchmarkMetric[] = [
    {
      metric: 'Brand terms',
      yourValue: '3.2%',
      sectorAvg: '6.5%',
      topPerformers: '12%',
      position: 'Below Avg ▼',
      gap: '-51%',
    },
    {
      metric: '"gift" + product',
      yourValue: '18%',
      sectorAvg: '25%',
      topPerformers: '42%',
      position: 'Below Avg ▼',
      gap: '-28%',
    },
    {
      metric: '"luxury" + product',
      yourValue: 'N/A',
      sectorAvg: '12%',
      topPerformers: '38%',
      position: 'Missing ▼▼',
      gap: 'Add 200+ KWs',
    },
    {
      metric: '"organic" + product',
      yourValue: '6%',
      sectorAvg: '14%',
      topPerformers: '28%',
      position: 'Below Avg ▼',
      gap: '-57%',
    },
    {
      metric: 'Long-tail (5+ words)',
      yourValue: '4.5%',
      sectorAvg: '7.8%',
      topPerformers: '15%',
      position: 'Below Avg ▼',
      gap: '-42%',
    },
    {
      metric: 'Own-brand',
      yourValue: '4.2%',
      sectorAvg: '11%',
      topPerformers: '16%',
      position: 'Critical ▼▼',
      gap: '-62%',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          <strong>Market Insights</strong> are based on aggregated industry data and research reports.
          Figures are illustrative and for strategic guidance purposes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BenchmarkCard
          title="Your Keyword Portfolio"
          value="15,733 Keywords"
          subtitle="91% Dead (0 conversions) • 0.17% Converting Rate"
          position="critical"
          icon={<Package className="w-5 h-5 text-red-600" />}
        />
        <BenchmarkCard
          title="Word Performance"
          value="82 Dead : 13 Good"
          subtitle="Dead/Good Ratio: 6.3:1 • Sector Avg: 4.5:1"
          position="below"
          icon={<FileText className="w-5 h-5 text-orange-600" />}
        />
        <BenchmarkCard
          title="Long-Tail Opportunity"
          value="12% of keywords"
          subtitle="5+ words • Sector Leaders: 30-35% • Missing 3,000+ terms"
          position="critical"
          icon={<Ruler className="w-5 h-5 text-red-600" />}
        />
      </div>

      <div>
        <h2 className="text-xl font-bold text-[#1C1D1C] mb-4">Word-Level Competitive Gaps</h2>
        <BenchmarkTable metrics={wordGapMetrics} />
      </div>

      <div>
        <h2 className="text-xl font-bold text-[#1C1D1C] mb-4">Strategic Insights</h2>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading insights...</div>
        ) : insights.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No insights available</div>
        ) : (
          insights.map((insight, idx) => (
            <InsightPanel
              key={idx}
              severity={insight.severity}
              title={insight.title}
              summary={insight.summary}
              details={insight.details}
              actions={insight.actions}
              estimatedValue={insight.estimatedValue}
            />
          ))
        )}
      </div>
    </div>
  )
}
