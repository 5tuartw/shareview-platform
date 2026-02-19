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
    ...(features.insights ? [{ id: 'insights', label: 'Market Comparison' }] : []),
    ...(features.market_insights ? [{ id: 'market-insights', label: 'Reports' }] : []),
  ]

  return <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={onSubTabChange} />
}
