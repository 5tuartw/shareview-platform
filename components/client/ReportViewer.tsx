'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Sparkles } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import InsightsPanel from '@/components/shared/InsightsPanel'

import { ReportDetail } from '@/types'

interface ReportViewerProps {
  reportId: number
  onClose: () => void
}

export default function ReportViewer({ reportId, onClose }: ReportViewerProps) {
  const [report, setReport] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/reports/${reportId}`)
        if (!response.ok) throw new Error('Failed to fetch report')
        const data = await response.json()
        setReport(data)
      } catch (err) {
        setError('Failed to load report')
        console.error('Error fetching report:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [reportId])

  const formatPeriodHeader = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
    return `${startDate.toLocaleDateString('en-GB', options)} – ${endDate.toLocaleDateString('en-GB', options)}`
  }

  const formatDomainName = (domain: string) => {
    const names: Record<string, string> = {
      overview: 'Overview',
      keywords: 'Keywords',
      categories: 'Categories',
      products: 'Products',
      auctions: 'Auctions',
    }
    return names[domain] || domain.charAt(0).toUpperCase() + domain.slice(1)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="h-8 bg-gray-200 rounded w-64 animate-pulse mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48 animate-pulse"></div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Report Not Found</h1>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600">{error || 'Report could not be loaded'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">
            {report.period_type.charAt(0).toUpperCase() + report.period_type.slice(1)} Report
          </h1>
          <p className="text-gray-600">{formatPeriodHeader(report.period_start, report.period_end)}</p>
        </div>
      </div>

      {/* Domains */}
      {report.domains.map((domainData) => {
        const metricCards = (domainData.domain_metrics?.metricCards as any[]) || []
        const hasInsights = domainData.ai_insights.insightsPanel !== null
        const showDisclaimer = domainData.ai_insights.showAIDisclaimer

        return (
          <div key={domainData.domain} className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              {formatDomainName(domainData.domain)}
              {showDisclaimer && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-50 text-purple-700 rounded-md">
                  <Sparkles className="w-3 h-3" />
                  AI-generated insights
                </span>
              )}
            </h2>

            {/* Metric Cards */}
            {metricCards.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map((card, idx) => (
                  <MetricCard
                    key={idx}
                    label={card.label}
                    value={card.value}
                    change={card.change}
                    changeLabel={card.changeLabel}
                    changeUnit={card.changeUnit}
                    status={card.status}
                    subtitle={card.subtitle}
                  />
                ))}
              </div>
            )}

            {/* AI Insights Panel */}
            {hasInsights && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <InsightsPanel
                  title={(domainData.ai_insights.insightsPanel as any)?.title}
                  insights={(domainData.ai_insights.insightsPanel as any)?.insights}
                  singleColumn={(domainData.ai_insights.insightsPanel as any)?.singleColumn}
                />
              </div>
            )}

            {/* No Insights Message */}
            {!hasInsights && metricCards.length === 0 && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-600">No insights available for this period</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
