'use client'

import { useState } from 'react'
import SuperAdminUserManagement from './SuperAdminUserManagement'
import PromptTemplatesPanel from './PromptTemplatesPanel'
import SuperAdminAiSettings from './SuperAdminAiSettings'
import AuctionClassificationSettings from './AuctionClassificationSettings'
import KeywordThresholdSettings from './KeywordThresholdSettings'
import SuperAdminGeneralSettings from './SuperAdminGeneralSettings'
import SuperAdminPipelineControls from './SuperAdminPipelineControls'
import { SubTabNavigation } from '@/components/shared'

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'ai' | 'thresholds' | 'operations'>('general')
  const [thresholdSubTab, setThresholdSubTab] = useState<'auctions' | 'search-terms'>('auctions')

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'users', label: 'Users & Access' },
    { id: 'ai', label: 'AI Settings' },
    { id: 'thresholds', label: 'Snapshot Thresholds' },
    { id: 'operations', label: 'Operations' },
  ]

  const thresholdSubTabs = [
    { id: 'auctions', label: 'Auctions' },
    { id: 'search-terms', label: 'Search Terms' },
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

      {activeTab === 'thresholds' && (
        <div className="space-y-4">
          <SubTabNavigation activeTab={thresholdSubTab} tabs={thresholdSubTabs} onTabChange={(tab) => setThresholdSubTab(tab as typeof thresholdSubTab)} />
          {thresholdSubTab === 'auctions' && <AuctionClassificationSettings />}
          {thresholdSubTab === 'search-terms' && <KeywordThresholdSettings />}
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
