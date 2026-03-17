'use client'

import React, { useState } from 'react'
import { SubTabNavigation } from '@/components/shared'
import AuctionContent from '@/components/client/AuctionContent'
import ComingSoonPanel from '@/components/client/ComingSoonPanel'
import AuctionDistributionStrips from '@/components/client/AuctionDistributionStrips'

interface AuctionsTabProps {
  retailerId: string
  isDemoRetailer?: boolean
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
  retailerConfig?: { insights?: boolean; market_insights?: boolean }
  visibleMetrics?: string[]
  auctionMetricIds?: string[]
  featuresEnabled?: Record<string, unknown>
  isAdmin?: boolean
}

export default function AuctionsTab({
  retailerId,
  isDemoRetailer = false,
  retailerConfig,
  visibleMetrics,
  auctionMetricIds,
  featuresEnabled,
  isAdmin,
}: AuctionsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('performance')

  const features = retailerConfig || { insights: true, market_insights: true }
  const showMarketComparisonTab = features.market_insights !== false || isAdmin
  const marketComparisonHiddenForRetailer = !!isAdmin && features.market_insights === false

  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(showMarketComparisonTab
      ? [{
          id: 'market-comparison',
          label: marketComparisonHiddenForRetailer
            ? 'Market Comparison - Hidden for retailer'
            : 'Market Comparison',
        }]
      : []),
    ...(features.insights !== false ? [{ id: 'insights', label: 'Insights' }] : []),
  ]

  return (
    <div className="space-y-6">
      <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={setActiveSubTab} />

      {activeSubTab === 'performance' && (
        <AuctionContent
          retailerId={retailerId}
          visibleMetrics={visibleMetrics}
          auctionMetricIds={auctionMetricIds}
          featuresEnabled={featuresEnabled}
          isAdmin={isAdmin}
          isDemoRetailer={isDemoRetailer}
        />
      )}

      {activeSubTab === 'market-comparison' && (
        <AuctionDistributionStrips retailerId={retailerId} />
      )}

      {activeSubTab === 'insights' && (
        <ComingSoonPanel />
      )}
    </div>
  )
}
