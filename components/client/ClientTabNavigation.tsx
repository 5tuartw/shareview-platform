'use client'

import TabRail from '@/components/shared/TabRail'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  tabs: Array<{ id: string; label: string }>
  staffTabs?: Array<{ id: string; label: string }>
}

export default function ClientTabNavigation({ activeTab, onTabChange, tabs, staffTabs }: TabNavigationProps) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-[1800px] mx-auto flex items-center justify-between">
        <TabRail activeTab={activeTab} onTabChange={onTabChange} tabs={tabs} level="primary" />
        {staffTabs && staffTabs.length > 0 && (
          <TabRail activeTab={activeTab} onTabChange={onTabChange} tabs={staffTabs} level="primary" variant="staff" className="px-6" />
        )}
      </div>
    </div>
  )
}
