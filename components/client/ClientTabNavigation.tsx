'use client'

import { cn } from '@/lib/utils'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  tabs: Array<{ id: string; label: string }>
}

export default function ClientTabNavigation({ activeTab, onTabChange, tabs }: TabNavigationProps) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto">
        <nav className="flex gap-1 px-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap transition-all border-b-2',
                activeTab === tab.id
                  ? 'border-[#F59E0B]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
