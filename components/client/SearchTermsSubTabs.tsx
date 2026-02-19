'use client'

import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface SearchTermsSubTabsProps {
  activeSubTab: string
  onSubTabChange: (tab: string) => void
  retailerConfig?: { insights?: boolean; market_insights?: boolean; show_reports_tab?: boolean }
}

export default function SearchTermsSubTabs({
  activeSubTab,
  onSubTabChange,
  retailerConfig,
}: SearchTermsSubTabsProps) {
  const features = retailerConfig || { insights: true, market_insights: true, show_reports_tab: false }

  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(features.insights ? [{ id: 'insights', label: 'Market Comparison' }] : []),
    ...(features.show_reports_tab ? [{ id: 'reports', label: 'Reports' }] : []),
  ]

  return <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={onSubTabChange} />
}
