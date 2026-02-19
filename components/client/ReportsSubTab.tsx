'use client'

import { useEffect, useState } from 'react'
import { FileText, Plus, Send } from 'lucide-react'
import ReportViewer from './ReportViewer'
import RequestReportModal from './RequestReportModal'
import GenerateReportModal from './GenerateReportModal'

interface ReportListItem {
  id: number
  retailer_id: number
  retailer_name: string
  period_start: string
  period_end: string
  period_type: string
  status: string
  report_type: string
  created_at: string
  published_at?: string
  published_by?: number
  domains: string[]
}

interface ReportsSubTabProps {
  retailerId: string
  domain: string
  featuresEnabled: Record<string, boolean>
}

export default function ReportsSubTab({ retailerId, domain, featuresEnabled }: ReportsSubTabProps) {
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  const fetchReports = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports?retailerId=${retailerId}`)
      if (!response.ok) throw new Error('Failed to fetch reports')
      const data: ReportListItem[] = await response.json()

      // Filter for reports that include this domain and are published
      const filtered = data.filter((report) => {
        return report.status === 'published' && 
               report.domains && 
               report.domains.includes(domain)
      })

      setReports(filtered)
    } catch (error) {
      console.error('Error fetching reports:', error)
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [retailerId])

  const handleReportGenerated = (reportId: number) => {
    setShowGenerateModal(false)
    fetchReports()
    setSelectedReportId(reportId)
  }

  const handleRequestSuccess = () => {
    setShowRequestModal(false)
    fetchReports()
  }

  const formatPeriodLabel = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
    return `${startDate.toLocaleDateString('en-GB', options)} – ${endDate.toLocaleDateString('en-GB', options)}`
  }

  if (selectedReportId) {
    return (
      <ReportViewer
        reportId={selectedReportId}
        onClose={() => setSelectedReportId(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : reports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:border-[#F59E0B] hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-[#FFF7ED] rounded-lg">
                  <FileText className="w-5 h-5 text-[#F59E0B]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {report.period_type.charAt(0).toUpperCase() + report.period_type.slice(1)} Report
                  </h3>
                  <p className="text-sm text-gray-600">
                    {formatPeriodLabel(report.period_start, report.period_end)}
                  </p>
                  {report.published_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Published {new Date(report.published_at).toLocaleDateString('en-GB')}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedReportId(report.id)}
                className="w-full px-4 py-2 bg-[#F59E0B] text-white rounded-md hover:bg-[#D97706] transition-colors text-sm font-medium"
              >
                Open Report
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="p-3 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No reports published yet</h3>
            <p className="text-gray-600 mb-6">
              {featuresEnabled.allow_report_request || featuresEnabled.allow_report_generate
                ? 'Get started by requesting or generating a report for this period.'
                : 'Reports will appear here once they are published.'}
            </p>
            <div className="flex gap-3 justify-center">
              {featuresEnabled.allow_report_request && (
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  <Send className="w-4 h-4" />
                  Request a Report
                </button>
              )}
              {featuresEnabled.allow_report_generate && (
                <button
                  onClick={() => setShowGenerateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#F59E0B] text-white rounded-md hover:bg-[#D97706] transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Generate a Report
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <RequestReportModal
        isOpen={showRequestModal}
        retailerId={retailerId}
        domain={domain}
        onClose={() => setShowRequestModal(false)}
        onSuccess={handleRequestSuccess}
      />

      <GenerateReportModal
        isOpen={showGenerateModal}
        retailerId={retailerId}
        domain={domain}
        onClose={() => setShowGenerateModal(false)}
        onReportGenerated={handleReportGenerated}
      />
    </div>
  )
}
