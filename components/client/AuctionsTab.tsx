'use client'

import React, { useState } from 'react'
import { SubTabNavigation } from '@/components/shared'
import AuctionContent from '@/components/client/AuctionContent'

interface AuctionsTabProps {
  retailerId: string
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
}

export default function AuctionsTab({ retailerId }: AuctionsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('performance')

  const tabs = [
    { id: 'performance', label: 'Performance' },
    { id: 'market-comparison', label: 'Market Comparison' },
    { id: 'insights', label: 'Insights' },
  ]

  return (
    <div className="space-y-6">
      <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={setActiveSubTab} />

      {activeSubTab === 'performance' && <AuctionContent retailerId={retailerId} />}

      {activeSubTab === 'market-comparison' && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-500">Market comparison coming soon.</p>
        </div>
      )}

      {activeSubTab === 'insights' && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-500">Auction insights coming soon.</p>
        </div>
      )}
    </div>
  )
}
