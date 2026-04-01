'use client'

import { cn } from '@/lib/utils'

export interface TabRailItem {
  id: string
  label: string
}

interface TabRailProps {
  activeTab: string
  tabs: TabRailItem[]
  onTabChange: (tab: string) => void
  level?: 'primary' | 'secondary'
  variant?: 'default' | 'staff'
  className?: string
}

export default function TabRail({
  activeTab,
  tabs,
  onTabChange,
  level = 'primary',
  variant = 'default',
  className,
}: TabRailProps) {
  return (
    <nav
      className={cn(
        level === 'primary'
          ? 'flex gap-1 px-6 overflow-x-auto'
          : '-mb-px flex gap-1 overflow-x-auto',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            level === 'primary'
              ? 'whitespace-nowrap px-4 py-3 text-sm font-bold transition-all border-b-2'
              : 'whitespace-nowrap rounded-t-md px-3 py-2.5 text-sm font-medium transition-all border-b-2',
            variant === 'staff'
              ? activeTab === tab.id
                ? 'border-[#F59E0B] bg-[#F59E0B] text-black'
                : 'border-transparent bg-[#F59E0B]/20 text-gray-700 hover:bg-[#F59E0B]/40 hover:text-black'
              : activeTab === tab.id
                ? level === 'primary'
                  ? 'border-[#F59E0B] text-gray-900'
                  : 'border-[#F59E0B] bg-white text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
