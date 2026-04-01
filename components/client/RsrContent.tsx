'use client'

import { useEffect, useState, useCallback } from 'react'

interface RsrRow {
  retailer_id: string
  retailer_name: string
  network: string
  report_month: string
  period_start_date?: string
  period_end_date?: string
  report_date?: string
  fetch_datetime: string
  impressions: number
  google_clicks: number
  network_clicks: number
  assists: number
  network_conversions_transaction: number
  google_conversions_transaction: number
  network_conversions_click: number
  google_conversions_click: number
  no_of_orders: number
  gmv: number
  commission_unvalidated: number
  commission_validated: number
  validation_rate: number
  css_spend: number
  profit: number
  ctr: number
  cpc: number
  conversion_rate: number
  epc: number
  validated_epc: number
  net_epc: number
  roi: number
  previous_commission_rate: number
  current_commission_rate: number
}

interface RsrContentProps {
  retailerId: string
  apiBase?: string
}

type ViewType = 'weekly' | 'monthly'

const COLUMNS: { key: keyof RsrRow; label: string; format?: 'number' | 'currency' | 'percent' | 'percent_raw' | 'pence' | 'date' }[] = [
  { key: 'impressions', label: 'Impressions', format: 'number' },
  { key: 'google_clicks', label: 'Google Clicks', format: 'number' },
  { key: 'network_clicks', label: 'Network Clicks', format: 'number' },
  { key: 'assists', label: 'Assists', format: 'number' },
  { key: 'google_conversions_transaction', label: 'Google Conv. (Txn)', format: 'number' },
  { key: 'network_conversions_transaction', label: 'Network Conv. (Txn)', format: 'number' },
  { key: 'google_conversions_click', label: 'Google Conv. (Click)', format: 'number' },
  { key: 'network_conversions_click', label: 'Network Conv. (Click)', format: 'number' },
  { key: 'no_of_orders', label: 'Orders', format: 'number' },
  { key: 'gmv', label: 'GMV', format: 'currency' },
  { key: 'commission_unvalidated', label: 'Commission (Unval.)', format: 'currency' },
  { key: 'commission_validated', label: 'Commission (Val.)', format: 'currency' },
  { key: 'validation_rate', label: 'Validation Rate', format: 'percent' },
  { key: 'css_spend', label: 'CSS Spend', format: 'currency' },
  { key: 'profit', label: 'Profit', format: 'currency' },
  { key: 'ctr', label: 'CTR', format: 'percent' },
  { key: 'cpc', label: 'CPC', format: 'pence' },
  { key: 'conversion_rate', label: 'CVR', format: 'percent' },
  { key: 'epc', label: 'EPC', format: 'pence' },
  { key: 'validated_epc', label: 'Validated EPC', format: 'pence' },
  { key: 'net_epc', label: 'Net EPC', format: 'pence' },
  { key: 'roi', label: 'ROI', format: 'percent_raw' },
  { key: 'previous_commission_rate', label: 'Prev. Commission Rate', format: 'percent' },
  { key: 'current_commission_rate', label: 'Curr. Commission Rate', format: 'percent' },
]

const formatValue = (value: unknown, format?: string): string => {
  if (value == null) return '—'
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(num)) return String(value)

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(num)
    case 'percent':
      return `${(num * 100).toFixed(2)}%`
    case 'percent_raw':
      return `${num.toFixed(2)}%`
    case 'pence':
      return `${(num * 100).toFixed(0)}p`
    case 'number':
      return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(num)
    default:
      return String(value)
  }
}

const formatPeriodLabel = (row: RsrRow, viewType: ViewType): string => {
  if (viewType === 'weekly' && row.period_start_date) {
    const d = new Date(row.period_start_date)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  if (row.report_month) {
    return row.report_month
  }
  return '—'
}

export default function RsrContent({ retailerId, apiBase }: RsrContentProps) {
  const [viewType, setViewType] = useState<ViewType>('weekly')
  const [rows, setRows] = useState<RsrRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const base = apiBase ?? '/api'
      const response = await fetch(`${base}/retailers/${retailerId}/rsr?view=${viewType}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Failed to load RSR data (${response.status})`)
      }
      const data = await response.json()
      setRows(data.rows ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RSR data')
    } finally {
      setLoading(false)
    }
  }, [retailerId, viewType, apiBase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">RSR Data</h2>
          <p className="text-sm text-gray-500">Full retailer sales report data from the analytics source</p>
        </div>
        <div className="inline-flex rounded-md shadow-sm" role="group">
          <button
            type="button"
            onClick={() => setViewType('weekly')}
            className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
              viewType === 'weekly'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => setViewType('monthly')}
            className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-b border-r ${
              viewType === 'monthly'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white border border-gray-200 rounded-lg p-12">
          <div className="flex items-center justify-center gap-3 text-gray-500">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading RSR data…</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && rows.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-500">No RSR data available for this retailer.</p>
        </div>
      )}

      {/* Data table */}
      {!loading && !error && rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="min-w-max w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {/* Frozen period column header */}
                  <th className="sticky left-0 top-0 z-30 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700 border-r border-gray-200 min-w-[140px]">
                    {viewType === 'weekly' ? 'Week Starting' : 'Month'}
                  </th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-right font-semibold text-gray-700 whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={`${row.period_start_date ?? row.report_month}-${idx}`}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  >
                    {/* Frozen period column */}
                    <td className={`sticky left-0 z-10 px-4 py-2.5 font-medium text-gray-900 border-r border-gray-200 whitespace-nowrap ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      {formatPeriodLabel(row, viewType)}
                    </td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap tabular-nums"
                      >
                        {formatValue(row[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400">
            {rows.length} {viewType === 'weekly' ? 'week' : 'month'}{rows.length !== 1 ? 's' : ''} · Staff-only data
          </div>
        </div>
      )}
    </div>
  )
}
