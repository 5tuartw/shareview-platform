'use client'

import { useState } from 'react'
import SuperAdminUserManagement from './SuperAdminUserManagement'
import PromptTemplatesPanel from './PromptTemplatesPanel'
import SuperAdminAiSettings from './SuperAdminAiSettings'
import AuctionClassificationSettings from './AuctionClassificationSettings'
import SuperAdminGeneralSettings from './SuperAdminGeneralSettings'
import SuperAdminPipelineControls from './SuperAdminPipelineControls'
import { SubTabNavigation } from '@/components/shared'

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'ai' | 'classifications' | 'operations'>('general')

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'users', label: 'Users & Access' },
    { id: 'ai', label: 'AI Settings' },
    { id: 'classifications', label: 'Classifications' },
    { id: 'operations', label: 'Operations' },
  ]

  return (
    <div className="space-y-6">
      <SubTabNavigation activeTab={activeTab} tabs={tabs} onTabChange={(tab) => setActiveTab(tab as typeof activeTab)} />

      {activeTab === 'general' && (
        <div>
          <SuperAdminGeneralSettings />
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <SuperAdminUserManagement />
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-6">
          <SuperAdminAiSettings />
          <PromptTemplatesPanel />
        </div>
      )}

      {activeTab === 'classifications' && (
        <div className="space-y-6">
          <AuctionClassificationSettings />
          <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-600">
            Additional domain classification controls (keywords, categories, products) will be added here as they are implemented.
          </div>
        </div>
      )}

      {activeTab === 'operations' && (
        <div className="space-y-6">
          <SuperAdminPipelineControls />
        </div>
      )}
    </div>
  )
}
