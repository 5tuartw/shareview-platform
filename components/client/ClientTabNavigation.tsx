'use client'

import TabRail from '@/components/shared/TabRail'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  tabs: Array<{ id: string; label: string }>
}

export default function ClientTabNavigation({ activeTab, onTabChange, tabs }: TabNavigationProps) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-[1800px] mx-auto">
        <TabRail activeTab={activeTab} onTabChange={onTabChange} tabs={tabs} level="primary" />
      </div>
    </div>
  )
}
