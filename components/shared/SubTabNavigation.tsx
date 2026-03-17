'use client'

import TabRail from '@/components/shared/TabRail'

export interface SubTab {
  id: string
  label: string
}

interface SubTabNavigationProps {
  activeTab: string
  tabs: SubTab[]
  onTabChange: (tab: string) => void
}

export default function SubTabNavigation({ activeTab, tabs, onTabChange }: SubTabNavigationProps) {
  return (
    <div className="border-b border-gray-200 bg-slate-50/70">
      <TabRail activeTab={activeTab} tabs={tabs} onTabChange={onTabChange} level="secondary" />
    </div>
  )
}

export const standardSubTabs: SubTab[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'performance', label: 'Performance' },
  { id: 'market-insights', label: 'Market Insights' },
]