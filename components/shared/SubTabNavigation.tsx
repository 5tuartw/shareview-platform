'use client'

import { cn } from '@/lib/utils'

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
    <div className="bg-white border-b" style={{ borderColor: '#FDE68A' }}>
      <nav className="flex px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'px-4 py-3 text-sm border-b-2 transition-all',
              activeTab === tab.id
                ? 'border-[#F59E0B]'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
            )}
            style={activeTab === tab.id ? { color: '#F59E0B' } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export const standardSubTabs: SubTab[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'performance', label: 'Performance' },
  { id: 'market-insights', label: 'Market Insights' },
]