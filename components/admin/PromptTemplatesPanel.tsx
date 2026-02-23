'use client'

import { useState, useEffect } from 'react'
import { Settings, Loader, AlertCircle } from 'lucide-react'

interface PromptForm {
  page_type: string
  tab_name: string
  insight_type: string
  prompt_text: string
  style_directive: string
}

export default function PromptTemplatesPanel() {
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [promptForm, setPromptForm] = useState<PromptForm>({
    page_type: 'overview',
    tab_name: 'insights',
    insight_type: 'insight_panel',
    prompt_text: '',
    style_directive: 'standard',
  })
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)

  const loadPromptTemplate = async (pageType: string, insightType: string) => {
    setPromptLoading(true)
    setPromptError(null)
    try {
      const response = await fetch(`/api/insights/prompt-templates?pageType=${pageType}&insightType=${insightType}`)
      if (!response.ok) throw new Error('Failed to load prompt template')

      const data = await response.json()
      if (data.length > 0) {
        const row = data[0]
        setPromptForm({
          ...promptForm,
          prompt_text: row.prompt_text,
          style_directive: row.style_directive || 'standard',
        })
      } else {
        setPromptForm({
          ...promptForm,
          prompt_text: '',
          style_directive: 'standard',
        })
      }
    } catch (error) {
      console.error('Error loading prompt template:', error)
      setPromptError('Failed to load prompt template')
    } finally {
      setPromptLoading(false)
    }
  }

  const handleSavePrompt = async () => {
    setPromptError(null)
    try {
      const response = await fetch('/api/insights/prompt-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptForm),
      })

      if (!response.ok) throw new Error('Failed to save prompt template')

      setPromptSaved(true)
      setTimeout(() => setPromptSaved(false), 3000)
    } catch (error) {
      console.error('Error saving prompt:', error)
      setPromptError('Failed to save prompt template')
    }
  }

  useEffect(() => {
    if (showPromptPanel) {
      loadPromptTemplate(promptForm.page_type, promptForm.insight_type)
    }
  }, [promptForm.page_type, promptForm.insight_type, showPromptPanel])

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#F59E0B]" />
          <h3 className="text-lg font-semibold text-gray-900">Prompt Templates</h3>
        </div>
        <button
          onClick={() => {
            setShowPromptPanel(!showPromptPanel)
            if (showPromptPanel) {
              setPromptError(null)
            }
          }}
          className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          {showPromptPanel ? 'Hide' : 'Edit Prompts'}
        </button>
      </div>

      {showPromptPanel && (
        <div className="space-y-4">
          {/* Error alert */}
          {promptError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-800">{promptError}</span>
            </div>
          )}

          {/* Row 1: 3 dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Page Type</label>
              <select
                value={promptForm.page_type}
                onChange={(e) => setPromptForm({ ...promptForm, page_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                disabled={promptLoading}
              >
                <option value="overview">Overview</option>
                <option value="keywords">Keywords</option>
                <option value="categories">Categories</option>
                <option value="products">Products</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Insight Type</label>
              <select
                value={promptForm.insight_type}
                onChange={(e) => setPromptForm({ ...promptForm, insight_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                disabled={promptLoading}
              >
                <option value="insight_panel">Insight Panel</option>
                <option value="market_analysis">Market Analysis</option>
                <option value="recommendation">Recommendation</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Style Directive</label>
              <select
                value={promptForm.style_directive}
                onChange={(e) => setPromptForm({ ...promptForm, style_directive: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                disabled={promptLoading}
              >
                <option value="standard">Standard</option>
                <option value="concise">Concise</option>
                <option value="detailed">Detailed</option>
                <option value="exec-summary">Executive Summary</option>
              </select>
            </div>
          </div>

          {/* Row 2: Prompt textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Text</label>
            <textarea
              rows={6}
              value={promptForm.prompt_text}
              onChange={(e) => setPromptForm({ ...promptForm, prompt_text: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              placeholder="Enter prompt text..."
              disabled={promptLoading}
            />
          </div>

          {/* Row 3: Save button + confirmation */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSavePrompt}
              disabled={promptLoading}
              className="px-4 py-2 bg-[#F59E0B] text-white text-sm font-medium rounded-md hover:bg-[#D97706] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {promptLoading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Save Prompt'
              )}
            </button>
            {promptSaved && (
              <span className="text-sm text-green-600 font-medium">✓ Saved</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
