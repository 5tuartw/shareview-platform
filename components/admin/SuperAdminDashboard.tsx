'use client'

import { useState } from 'react'
import SuperAdminUserManagement from './SuperAdminUserManagement'
import PromptTemplatesPanel from './PromptTemplatesPanel'
import SuperAdminAiSettings from './SuperAdminAiSettings'
import AuctionClassificationSettings from './AuctionClassificationSettings'
import { SubTabNavigation } from '@/components/shared'

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'ai' | 'classifications'>('users')

  const tabs = [
    { id: 'users', label: 'Users & Access' },
    { id: 'ai', label: 'AI Settings' },
    { id: 'classifications', label: 'Classifications' },
  ]

  return (
    <div className="space-y-6">
      <SubTabNavigation activeTab={activeTab} tabs={tabs} onTabChange={(tab) => setActiveTab(tab as typeof activeTab)} />

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
    </div>
  )
}
