'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import { fetchRetailerOverview, fetchRetailerMonthlyData } from '@/lib/api-client'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { MonthlyMetricRow, RetailerOverview } from '@/types'

interface OverallContentProps {
  retailerId: string
  activeSubTab: string
  visibleMetrics?: string[]
}

const formatWeekLabel = (dateStr: string) => {
  try {
    const date = new Date(dateStr)
    const month = date.toLocaleDateString('en-GB', { month: 'short' })
    const day = date.getDate().toString().padStart(2, '0')
    return `${month} ${day}`
  } catch {
    return dateStr
  }
}

const formatMonthLabel = (dateStr: string) => {
  try {
    const date = new Date(dateStr)
    const month = date.toLocaleDateString('en-GB', { month: 'short' })
    const year = date.getFullYear()
    return `${month} ${year}`
  } catch {
    return dateStr
  }
}

export default function OverallContent({ retailerId, activeSubTab, visibleMetrics }: OverallContentProps) {
  const [weeklyData, setWeeklyData] = useState<RetailerOverview | null>(null)
  const [monthlyData, setMonthlyData] = useState<MonthlyMetricRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [chart1IsLine, setChart1IsLine] = useState(true)
  const [chart2IsLine, setChart2IsLine] = useState(false)
  const [chart3IsLine, setChart3IsLine] = useState(false)
  const [chart4IsLine, setChart4IsLine] = useState(true)

  const metricsFilter = visibleMetrics && visibleMetrics.length > 0 ? visibleMetrics : null
  const isMetricVisible = (metric: string) => !metricsFilter || metricsFilter.includes(metric)
  const showGmvChart = isMetricVisible('gmv')
  const showConversionChart = isMetricVisible('conversions') || isMetricVisible('cvr')
  const showTrafficChart = isMetricVisible('impressions') || isMetricVisible('clicks') || isMetricVisible('ctr')
  const showRoiChart = isMetricVisible('roi')

  useEffect(() => {
    if (!retailerId) return

    const loadData = async () => {
      try {
        setLoading(true)
        const [weekly, monthly] = await Promise.all([
          fetchRetailerOverview(retailerId, '13-weeks'),
          fetchRetailerMonthlyData(retailerId),
        ])
        setWeeklyData(weekly)
        setMonthlyData(monthly.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [retailerId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-gray-600">Loading overall performance data...</p>
        </div>
      </div>
    )
  }

  if (error || !weeklyData || !monthlyData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Failed to load data'}</p>
        </div>
      </div>
    )
  }

  console.log('OverallContent - activeSubTab:', activeSubTab)
  console.log('OverallContent - weeklyData:', weeklyData)
  
  const isWeeklyView = activeSubTab === '13-weeks'
  let chartData: Array<Record<string, number | string>> = []

  console.log('OverallContent - isWeeklyView:', isWeeklyView)

  if (isWeeklyView) {
    // Use history array which contains the 13 weeks of data from retailer_metrics
    const historyData = weeklyData.history || weeklyData.weekly_trend || []
    console.log('Weekly data - historyData length:', historyData.length, 'data:', historyData.slice(0, 3))
    chartData = historyData.map((item, index) => {
      return {
        ...item,
        week: item.period_start,
        date: item.period_start,
        label: formatWeekLabel(item.period_start),
        index,
        commission: item.gmv * 0.05, // estimate commission from gmv
      }
    })
    console.log('Weekly chartData length:', chartData.length, 'labels:', chartData.map(d => d.label))
  } else if (monthlyData && Array.isArray(monthlyData)) {
    const parseMonthYear = (monthStr: string): Date => {
      try {
        const parts = monthStr.trim().split(' ')
        if (parts.length === 2) {
          const monthName = parts[0]
          const year = parseInt(parts[1])
          const monthMap: { [key: string]: number } = {
            jan: 0,
            january: 0,
            feb: 1,
            february: 1,
            mar: 2,
            march: 2,
            apr: 3,
            april: 3,
            may: 4,
            jun: 5,
            june: 5,
            jul: 6,
            july: 6,
            aug: 7,
            august: 7,
            sep: 8,
            september: 8,
            oct: 9,
            october: 9,
            nov: 10,
            november: 10,
            dec: 11,
            december: 11,
          }
          const monthNum = monthMap[monthName.toLowerCase()]
          if (monthNum !== undefined) {
            return new Date(year, monthNum, 1)
          }
        }
      } catch (err) {
        console.error('Failed to parse month:', monthStr, err)
      }
      return new Date(0)
    }

    chartData = [...monthlyData]
      .sort((a, b) => {
        const dateA = parseMonthYear(a.report_month)
        const dateB = parseMonthYear(b.report_month)
        return dateA.getTime() - dateB.getTime()
      })
      .map((row, index) => {
        const gmv = row.gmv || 0
        const commission = row.commission_validated || 0
        const profit = row.profit || 0
        const conversions = (row.google_conversions_transaction || 0) + (row.network_conversions_transaction || 0)
        const clicks = (row.google_clicks || 0) + (row.network_clicks || 0)
        const cvr = (row.conversion_rate || 0) / 100

        let roi = 0
        if (commission > 0 && isFinite(profit / commission)) {
          roi = (profit / commission) * 100
        }

        return {
          week: row.report_month,
          date: row.report_month,
          label: formatMonthLabel(row.report_month),
          gmv,
          commission,
          profit,
          conversions,
          impressions: row.impressions || 0,
          clicks,
          cvr,
          roi,
          index,
        }
      })
  }

  const roiValues = chartData.map((item) => Number(item.roi)).filter((value) => isFinite(value))
  const profitValues = chartData.map((item) => Number(item.profit)).filter((value) => isFinite(value))

  const roiMin = Math.min(...roiValues, 0)
  const roiMax = Math.max(...roiValues, 0)
  const profitMin = Math.min(...profitValues, 0)
  const profitMax = Math.max(...profitValues, 0)

  const roiMaxRange = Math.max(Math.abs(roiMin), Math.abs(roiMax))
  const profitMaxRange = Math.max(Math.abs(profitMin), Math.abs(profitMax))

  const roiDomain = [-roiMaxRange * 1.1, roiMaxRange * 1.1]
  const profitDomain = [-profitMaxRange * 1.1, profitMaxRange * 1.1]

  return (
    <div className="space-y-6">
      {(activeSubTab === '13-weeks' || activeSubTab === '13-months') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {showGmvChart && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                GMV & Commission Validated
              </h3>
              <button
                onClick={() => setChart1IsLine(!chart1IsLine)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700"
                title={chart1IsLine ? 'Switch to bar chart' : 'Switch to line chart'}
              >
                {chart1IsLine ? <BarChart3 size={16} /> : <LineChartIcon size={16} />}
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {chart1IsLine ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'GMV',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#F97316' },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'Commission',
                      angle: 90,
                      position: 'insideRight',
                      style: { fontSize: 11, fill: '#3B82F6' },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value) => formatCurrency(Number(value) || 0)}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="gmv" stroke="#F97316" strokeWidth={2.5} dot={false} name="GMV" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="commission"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={false}
                    strokeDasharray="5 5"
                    name="Commission"
                  />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'GMV',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#F97316' },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'Commission',
                      angle: 90,
                      position: 'insideRight',
                      style: { fontSize: 11, fill: '#3B82F6' },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value) => formatCurrency(Number(value) || 0)}
                  />
                  <Bar yAxisId="left" dataKey="gmv" fill="#F97316" name="GMV" />
                  <Bar yAxisId="right" dataKey="commission" fill="#3B82F6" name="Commission" />
                </BarChart>
              )}
            </ResponsiveContainer>
            </div>
          )}

          {showConversionChart && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Conversions & Conversion Rate
              </h3>
              <button
                onClick={() => setChart2IsLine(!chart2IsLine)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700"
                title={chart2IsLine ? 'Switch to bar chart' : 'Switch to line chart'}
              >
                {chart2IsLine ? <BarChart3 size={16} /> : <LineChartIcon size={16} />}
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {chart2IsLine ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'Conversions',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#10B981' },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${(Number(value) * 100).toFixed(2)}%`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'CVR',
                      angle: 90,
                      position: 'insideRight',
                      style: { fontSize: 11, fill: '#EF4444' },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value, name) => {
                      if (name === 'CVR') return `${((Number(value) || 0) * 100).toFixed(2)}%`
                      return formatNumber(Number(value) || 0)
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="conversions"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    dot={false}
                    name="Conversions"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cvr"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={false}
                    strokeDasharray="5 5"
                    name="CVR"
                  />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'Conversions',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#10B981' },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${(Number(value) * 100).toFixed(2)}%`}
                    stroke="#9CA3AF"
                    label={{
                      value: 'CVR',
                      angle: 90,
                      position: 'insideRight',
                      style: { fontSize: 11, fill: '#EF4444' },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value, name) => {
                      if (name === 'CVR') return `${((Number(value) || 0) * 100).toFixed(2)}%`
                      return formatNumber(Number(value) || 0)
                    }}
                  />
                  <Bar yAxisId="left" dataKey="conversions" fill="#10B981" name="Conversions" />
                  <Bar yAxisId="right" dataKey="cvr" fill="#EF4444" name="CVR" />
                </BarChart>
              )}
            </ResponsiveContainer>
            </div>
          )}

          {showTrafficChart && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Impressions & Clicks
              </h3>
              <button
                onClick={() => setChart3IsLine(!chart3IsLine)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700"
                title={chart3IsLine ? 'Switch to bar chart' : 'Switch to line chart'}
              >
                {chart3IsLine ? <BarChart3 size={16} /> : <LineChartIcon size={16} />}
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {chart3IsLine ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value) => formatNumber(Number(value) || 0)}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="plainline" />
                  <Line type="monotone" dataKey="impressions" stroke="#6366F1" strokeWidth={2.5} dot={false} name="Impressions" />
                  <Line type="monotone" dataKey="clicks" stroke="#F59E0B" strokeWidth={2.5} dot={false} name="Clicks" />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value) => formatNumber(Number(value) || 0)}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="rect" />
                  <Bar dataKey="impressions" fill="#6366F1" name="Impressions" />
                  <Bar dataKey="clicks" fill="#F59E0B" name="Clicks" />
                </BarChart>
              )}
            </ResponsiveContainer>
            </div>
          )}

          {showRoiChart && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                ROI & Profit
              </h3>
              <button
                onClick={() => setChart4IsLine(!chart4IsLine)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700"
                title={chart4IsLine ? 'Switch to bar chart' : 'Switch to line chart'}
              >
                {chart4IsLine ? <BarChart3 size={16} /> : <LineChartIcon size={16} />}
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {chart4IsLine ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    domain={profitDomain}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    stroke="#9CA3AF"
                    domain={roiDomain}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value, name) => {
                      if (name === 'ROI') return `${Number(value).toFixed(0)}%`
                      return formatCurrency(Number(value) || 0)
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="plainline" />
                  <Line yAxisId="left" type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2.5} dot={false} name="Profit" />
                  <Line yAxisId="right" type="monotone" dataKey="roi" stroke="#6B7280" strokeWidth={2.5} dot={false} name="ROI" />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9CA3AF" interval={1} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                    stroke="#9CA3AF"
                    domain={profitDomain}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    stroke="#9CA3AF"
                    domain={roiDomain}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                    formatter={(value, name) => {
                      if (name === 'ROI') return `${Number(value).toFixed(0)}%`
                      return formatCurrency(Number(value) || 0)
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="rect" />
                  <Bar yAxisId="left" dataKey="profit" fill="#10B981" name="Profit" />
                  <Bar yAxisId="right" dataKey="roi" fill="#6B7280" name="ROI" />
                </BarChart>
              )}
            </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
