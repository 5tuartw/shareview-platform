'use client'

import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface OverviewSubTabsProps {
  activeSubTab: string
  onSubTabChange: (tab: string) => void
  retailerConfig: { insights: boolean; market_insights: boolean; show_reports_tab?: boolean }
}

export default function OverviewSubTabs({
  activeSubTab,
  onSubTabChange,
  retailerConfig,
}: OverviewSubTabsProps) {
  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(retailerConfig.market_insights ? [{ id: 'market-comparison', label: 'Market Comparison' }] : []),
    ...(retailerConfig.insights ? [{ id: 'insights', label: 'Insights' }] : []),
    ...(retailerConfig.show_reports_tab ? [{ id: 'reports', label: 'Reports' }] : []),
  ]

  return <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={onSubTabChange} />
}
