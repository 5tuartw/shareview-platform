'use client'

import React, { useRef } from 'react'

interface TabItem {
  id: string
  label: string
  isAdmin?: boolean
}

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isViewingAsClient: boolean
  tabs: TabItem[]
}

export default function TabNavigation({
  activeTab,
  onTabChange,
  isViewingAsClient,
  tabs,
}: TabNavigationProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const focusTab = (index: number) => {
    const button = buttonRefs.current[index]
    if (button) {
      button.focus()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return

    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + direction + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]
    if (nextTab) {
      onTabChange(nextTab.id)
      focusTab(nextIndex)
    }
  }

  return (
    <div className="border-b border-white/10 bg-[#1C1D1C]">
      <div className="max-w-7xl mx-auto">
        <nav className="flex gap-2 px-6 overflow-x-auto" role="tablist" aria-label="Client dashboard tabs">
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id
            const isAdmin = tab.isAdmin
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  buttonRefs.current[index] = node
                }}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`tab-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onClick={() => onTabChange(tab.id)}
                className={`whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  isActive
                    ? 'border-white text-white'
                    : 'border-transparent text-white/70 hover:text-white'
                } ${isAdmin ? 'bg-white/5 rounded-md' : ''} ${
                  isAdmin && isViewingAsClient ? 'opacity-50' : ''
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
