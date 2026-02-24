'use client'

import React, { useState } from 'react'
import CategoriesContent from '@/components/client/CategoriesContent'
import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface CategoriesTabProps {
  retailerId: string
  retailerConfig?: { insights?: boolean; market_insights?: boolean; reports?: boolean }
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
}

export default function CategoriesTab({ retailerId, retailerConfig }: CategoriesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('performance')

  const features = retailerConfig || { insights: true, market_insights: true, reports: true }
  const featuresEnabled = {
    insights: features.insights ?? true,
    market_insights: features.market_insights ?? true,
    reports: features.reports ?? true,
  }

  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(featuresEnabled.market_insights ? [{ id: 'competitor-comparison', label: 'Competitor Comparison' }] : []),
    ...(featuresEnabled.market_insights ? [{ id: 'market-insights', label: 'Market Insights' }] : []),
    ...(featuresEnabled.reports ? [{ id: 'reports', label: 'Reports' }] : []),
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
