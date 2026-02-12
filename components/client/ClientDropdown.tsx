'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { RetailerListItem } from '@/types'

interface ClientDropdownProps {
  retailers: RetailerListItem[]
  currentRetailerId: string
  onClientChange: (retailerId: string) => void
  isSwitching?: boolean
}

export default function ClientDropdown({
  retailers,
  currentRetailerId,
  onClientChange,
  isSwitching = false,
}: ClientDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const sortedRetailers = useMemo(() => {
    const filtered = retailers.filter((retailer) =>
      retailer.retailer_name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return filtered.sort((a, b) => a.retailer_name.localeCompare(b.retailer_name))
  }, [retailers, searchQuery])

  const currentRetailer = retailers.find((retailer) => retailer.retailer_id === currentRetailerId)

  const handleSelect = (retailer: RetailerListItem) => {
    setAnnouncement(`Switching to ${retailer.retailer_name}.`)
    setIsOpen(false)
    onClientChange(retailer.retailer_id)
  }

  return (
    <div ref={containerRef} className="relative">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-white/10 text-white hover:bg-white/15 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select client"
        disabled={isSwitching}
      >
        <span className="text-sm font-medium">
          {currentRetailer?.retailer_name || 'Select client'}
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-72 bg-white/10 border border-white/10 rounded-lg shadow-lg backdrop-blur z-50"
          role="listbox"
          aria-label="Client list"
        >
          <div className="p-3 border-b border-white/10">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search clients"
              className="w-full px-3 py-2 rounded-md bg-white/10 text-sm text-white placeholder:text-white/60 border border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Search clients"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {sortedRetailers.map((retailer) => {
              const isCurrent = retailer.retailer_id === currentRetailerId
              return (
                <button
                  key={retailer.retailer_id}
                  type="button"
                  onClick={() => handleSelect(retailer)}
                  className="w-full flex items-center justify-between px-4 py-2 text-left text-sm text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  role="option"
                  aria-selected={isCurrent}
                >
                  <span>{retailer.retailer_name}</span>
                  {isCurrent && <Check className="w-4 h-4 text-white" />}
                </button>
              )
            })}
            {sortedRetailers.length === 0 && (
              <div className="px-4 py-3 text-sm text-white/70">No clients found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
