'use client'

import SuperAdminUserManagement from './SuperAdminUserManagement'
import PromptTemplatesPanel from './PromptTemplatesPanel'
import { Key } from 'lucide-react'

export default function SuperAdminDashboard() {
  const aiProvider = process.env.NEXT_PUBLIC_AI_PROVIDER || 'OpenAI'

  return (
    <div className="space-y-6">
      {/* Section 1: User Management */}
      <div>
        <SuperAdminUserManagement />
      </div>

      {/* Section 2: API Keys */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-[#F59E0B]" />
          <h3 className="text-lg font-semibold text-gray-900">API Keys</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
            <div className="text-sm text-gray-900 font-mono">{aiProvider}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <div className="text-sm text-gray-400 font-mono">••••••••••••••••</div>
          </div>
          <p className="text-sm text-gray-600 italic">
            API keys are managed via environment variables. Runtime editing is a future enhancement.
          </p>
        </div>
      </div>

      {/* Section 3: Global AI Prompts */}
      <div>
        <PromptTemplatesPanel />
      </div>
    </div>
  )
}
