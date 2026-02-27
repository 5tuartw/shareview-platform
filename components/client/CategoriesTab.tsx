'use client'

import React, { useState } from 'react'
import CategoriesContent from '@/components/client/CategoriesContent'
import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface CategoriesTabProps {
  retailerId: string
  retailerConfig?: { insights?: boolean; market_insights?: boolean }
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
}

export default function CategoriesTab({ retailerId, retailerConfig }: CategoriesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('performance')

  const features = retailerConfig || { insights: true, market_insights: true }
  const featuresEnabled = {
    insights: features.insights ?? true,
    market_insights: features.market_insights ?? true,
  }

  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(featuresEnabled.market_insights ? [{ id: 'market-comparison', label: 'Market Comparison' }] : []),
    ...(featuresEnabled.insights ? [{ id: 'insights', label: 'Insights' }] : []),
  ]

  return (
    <div className="space-y-6">
      <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={setActiveSubTab} />
      
      <CategoriesContent
        retailerId={retailerId}
        activeSubTab={activeSubTab}
        featuresEnabled={featuresEnabled}
      />
    </div>
  )
}
