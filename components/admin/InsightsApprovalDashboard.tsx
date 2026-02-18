'use client'

import React, { useState, useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface Insight {
  id: number
  retailer_id: string
  page_type: string
  tab_name: string
  period_start: string
  period_end: string
  insight_type: string
  insight_data: any
  status: string
  is_active: boolean
  approved_by: number | null
  approved_at: string | null
  created_at: string
}

interface Filters {
  retailer: string
  pageType: string
  status: string
}

export default function InsightsApprovalDashboard() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({
    retailer: '',
    pageType: '',
    status: 'pending',
  })
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchInsights = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.retailer) params.set('retailerId', filters.retailer)
      if (filters.pageType) params.set('pageType', filters.pageType)

      const response = await fetch(`/api/insights/pending?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch insights')

      const data = await response.json()
      setInsights(data)
    } catch (error) {
      console.error('Error fetching insights:', error)
      setActionMessage({ type: 'error', text: 'Failed to load insights' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInsights()
  }, [filters])

  const handleApprove = async (id: number) => {
    try {
      const response = await fetch(`/api/insights/${id}/approve`, {
        method: 'POST',
      })

      if (!response.ok) throw new Error('Failed to approve insight')

      setActionMessage({ type: 'success', text: 'Insight approved successfully' })
      fetchInsights()

      setTimeout(() => setActionMessage(null), 3000)
    } catch (error) {
      console.error('Error approving insight:', error)
      setActionMessage({ type: 'error', text: 'Failed to approve insight' })
    }
  }

  const handleReject = async (id: number) => {
    try {
      const response = await fetch(`/api/insights/${id}/reject`, {
        method: 'POST',
      })

      if (!response.ok) throw new Error('Failed to reject insight')

      setActionMessage({ type: 'success', text: 'Insight rejected successfully' })
      fetchInsights()

      setTimeout(() => setActionMessage(null), 3000)
    } catch (error) {
      console.error('Error rejecting insight:', error)
      setActionMessage({ type: 'error', text: 'Failed to reject insight' })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800">
            <AlertCircle className="w-3 h-3" />
            Pending
          </span>
        )
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        )
      default:
        return null
    }
  }

  const getInsightPreview = (data: any) => {
    if (!data) return 'No insight data'
    
    // Handle different insight data structures
    if (typeof data === 'string') return data.substring(0, 150) + '...'
    
    if (data.insights && Array.isArray(data.insights) && data.insights.length > 0) {
      const firstInsight = data.insights[0]
      if (firstInsight.text) return firstInsight.text.substring(0, 150) + '...'
      if (firstInsight.message) return firstInsight.message.substring(0, 150) + '...'
    }

    if (data.message) return data.message.substring(0, 150) + '...'
    
    return JSON.stringify(data).substring(0, 150) + '...'
  }

  const uniqueRetailers = Array.from(new Set(insights.map(i => i.retailer_id))).sort()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F59E0B]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retailer
            </label>
            <select
              value={filters.retailer}
              onChange={(e) => setFilters({ ...filters, retailer: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            >
              <option value="">All Retailers</option>
              {uniqueRetailers.map((retailer) => (
                <option key={retailer} value={retailer}>
                  {retailer}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Page Type
            </label>
            <select
              value={filters.pageType}
              onChange={(e) => setFilters({ ...filters, pageType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            >
              <option value="">All Page Types</option>
              <option value="overview">Overview</option>
              <option value="keywords">Keywords</option>
              <option value="categories">Categories</option>
              <option value="products">Products</option>
              <option value="auctions">Auctions</option>
              <option value="coverage">Coverage</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div
          className={`p-4 rounded-md ${
            actionMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Insights List */}
      {insights.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No insights found for the selected filters
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {insight.retailer_id}
                    </h3>
                    {getStatusBadge(insight.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="font-medium">{insight.page_type}</span>
                    {insight.tab_name && <span>• {insight.tab_name}</span>}
                    <span>
                      • {new Date(insight.period_start).toLocaleDateString()} -{' '}
                      {new Date(insight.period_end).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-700">{getInsightPreview(insight.insight_data)}</p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Created {new Date(insight.created_at).toLocaleString()}
                </span>

                {insight.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(insight.id)}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors flex items-center gap-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(insight.id)}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
