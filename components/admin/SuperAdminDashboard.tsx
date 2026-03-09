'use client'

import SuperAdminUserManagement from './SuperAdminUserManagement'
import PromptTemplatesPanel from './PromptTemplatesPanel'
import SuperAdminAiSettings from './SuperAdminAiSettings'

export default function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Section 1: User Management */}
      <div>
        <SuperAdminUserManagement />
      </div>

      {/* Section 2: AI Provider Settings */}
      <div>
        <SuperAdminAiSettings />
      </div>

      {/* Section 3: Global AI Prompts */}
      <div>
        <PromptTemplatesPanel />
      </div>
    </div>
  )
}
