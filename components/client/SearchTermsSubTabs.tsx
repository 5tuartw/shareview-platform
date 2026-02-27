'use client'

import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface SearchTermsSubTabsProps {
  activeSubTab: string
  onSubTabChange: (tab: string) => void
  retailerConfig?: { insights?: boolean; market_insights?: boolean }
}

export default function SearchTermsSubTabs({
  activeSubTab,
  onSubTabChange,
  retailerConfig,
}: SearchTermsSubTabsProps) {
  const features = retailerConfig || { insights: true, market_insights: true }

  const tabs = [
    { id: 'performance', label: 'Performance' },
    { id: 'word-analysis', label: 'Word Analysis' },
    ...(features.market_insights ? [{ id: 'market-comparison', label: 'Market Comparison' }] : []),
    ...(features.insights ? [{ id: 'insights', label: 'Insights' }] : []),
  ]

  return <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={onSubTabChange} />
}
