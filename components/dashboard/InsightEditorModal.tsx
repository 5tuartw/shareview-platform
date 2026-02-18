'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'

interface Insight {
  id: number
  insight_type: string
  insight_data: any
  status: string
}

interface InsightEditorModalProps {
  insight: Insight
  onSave: (data: { insight_data: any; status: string }) => Promise<void>
  onClose: () => void
}

export default function InsightEditorModal({ insight, onSave, onClose }: InsightEditorModalProps) {
  const [insightData, setInsightData] = useState(insight.insight_data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isInsightPanel = insight.insight_type === 'insight_panel'
  const isMarketAnalysis = insight.insight_type === 'market_analysis'
  const isRecommendation = insight.insight_type === 'recommendation'

  const handleTextareaChange = (section: string, index: number, value: string) => {
    setInsightData((prev: any) => {
      const newData = { ...prev }
      if (!newData[section]) newData[section] = []
      newData[section][index] = value
      return newData
    })
  }

  const handleJsonChange = (value: string) => {
    setInsightData(value)
  }

  const handleSave = async (submitForApproval: boolean) => {
    setSaving(true)
    setError(null)

    try {
      let parsedData = insightData

      // If it's a JSON textarea, parse it
      if (!isInsightPanel && !isMarketAnalysis && !isRecommendation) {
        parsedData = JSON.parse(insightData)
      }

      await onSave({
        insight_data: parsedData,
        status: submitForApproval ? 'pending' : 'draft',
      })

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save insight')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Edit {insight.insight_type.replace(/_/g, ' ')}</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-800 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {isInsightPanel && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Beat Rivals</label>
                {insightData.beatRivals?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('beatRivals', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Optimise Spend</label>
                {insightData.optimiseSpend?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('optimiseSpend', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Explore Opportunities</label>
                {insightData.exploreOpportunities?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('exploreOpportunities', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>
            </div>
          )}

          {isMarketAnalysis && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Headline</label>
                <input
                  type="text"
                  value={insightData.headline || ''}
                  onChange={(e) =>
                    setInsightData((prev: any) => ({ ...prev, headline: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Summary</label>
                <textarea
                  value={insightData.summary || ''}
                  onChange={(e) =>
                    setInsightData((prev: any) => ({ ...prev, summary: e.target.value }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Highlights</label>
                {insightData.highlights?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('highlights', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Risks</label>
                {insightData.risks?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('risks', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>
            </div>
          )}

          {isRecommendation && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quick Wins</label>
                {insightData.quickWins?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('quickWins', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Strategic Moves</label>
                {insightData.strategicMoves?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('strategicMoves', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Watch List</label>
                {insightData.watchList?.map((text: string, idx: number) => (
                  <textarea
                    key={idx}
                    value={text}
                    onChange={(e) => handleTextareaChange('watchList', idx, e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                  />
                ))}
              </div>
            </div>
          )}

          {!isInsightPanel && !isMarketAnalysis && !isRecommendation && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Insight Data (JSON)
              </label>
              <textarea
                value={typeof insightData === 'string' ? insightData : JSON.stringify(insightData, null, 2)}
                onChange={(e) => handleJsonChange(e.target.value)}
                rows={20}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F59E0B] font-mono text-sm"
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-4 py-2 bg-[#F59E0B] text-white rounded-md hover:bg-[#D97706] transition-colors disabled:opacity-50"
          >
            {saving ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  )
}
