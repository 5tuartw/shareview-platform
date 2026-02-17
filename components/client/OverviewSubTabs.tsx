'use client'

import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface OverviewSubTabsProps {
  activeSubTab: string
  onSubTabChange: (tab: string) => void
  retailerConfig: { insights: boolean; market_insights: boolean }
}

export default function OverviewSubTabs({
  activeSubTab,
  onSubTabChange,
  retailerConfig,
}: OverviewSubTabsProps) {
  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(retailerConfig.insights ? [{ id: 'insights', label: 'Insights' }] : []),
    ...(retailerConfig.market_insights ? [{ id: 'market-insights', label: 'Market Insights' }] : []),
  ]

  return <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={onSubTabChange} />
}
