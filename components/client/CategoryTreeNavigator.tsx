'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight, X, Layers } from 'lucide-react'
import { fetchCategoryPerformance } from '@/lib/api-client'
import type { CategoryData } from '@/types'

interface CategoryTreeNavigatorProps {
  retailerId: string
  currentPath: string | null
  onNavigate: (path: string | null) => void
  nodeOnlyMode: boolean
  onToggleNodeOnly: (value: boolean) => void
  period: string
}

export default function CategoryTreeNavigator({
  retailerId,
  currentPath,
  onNavigate,
  nodeOnlyMode,
  onToggleNodeOnly,
  period,
}: CategoryTreeNavigatorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [l1Categories, setL1Categories] = useState<CategoryData[]>([])
  const [l2Cache, setL2Cache] = useState<Record<string, CategoryData[]>>({})
  const [hoveredL1, setHoveredL1] = useState<string | null>(null)
  const [loadingL1, setLoadingL1] = useState(false)
  const [loadingL2, setLoadingL2] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHoveredL1(null)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Load L1 categories when menu opens
  useEffect(() => {
    if (!isOpen || l1Categories.length > 0) return
    const load = async () => {
      setLoadingL1(true)
      try {
        const result = await fetchCategoryPerformance(retailerId, { depth: 1, period })
        setL1Categories(result.categories)
      } catch (err) {
        console.error('Failed to load L1 categories', err)
      } finally {
        setLoadingL1(false)
      }
    }
    load()
  }, [isOpen, retailerId, period, l1Categories.length])

  // Load L2 when an L1 is hovered
  useEffect(() => {
    if (!hoveredL1 || l2Cache[hoveredL1] !== undefined) return
    const load = async () => {
      setLoadingL2(true)
      try {
        const result = await fetchCategoryPerformance(retailerId, {
          parent_path: hoveredL1,
          period,
        })
        setL2Cache((prev) => ({ ...prev, [hoveredL1]: result.categories }))
      } catch (err) {
        console.error('Failed to load L2 categories', err)
      } finally {
        setLoadingL2(false)
      }
    }
    load()
  }, [hoveredL1, retailerId, period, l2Cache])

  // Reset cache when period changes
  useEffect(() => {
    setL1Categories([])
    setL2Cache({})
    setHoveredL1(null)
  }, [period])

  const handleNavigate = (path: string | null) => {
    onNavigate(path)
    setIsOpen(false)
    setHoveredL1(null)
  }

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => {
      setHoveredL1(null)
    }, 150)
  }

  const pathLabel = currentPath ? currentPath.replace(/ > /g, ' › ') : null
  const l2Items = hoveredL1 ? (l2Cache[hoveredL1] ?? null) : null

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-3">
      {/* Cascade menu trigger + flyout */}
      <div ref={containerRef} className="relative">
        <button
          onClick={() => {
            setIsOpen((prev) => !prev)
            if (isOpen) setHoveredL1(null)
          }}
          className={`flex items-center gap-2 text-sm font-medium rounded-md px-3 py-1.5 border transition-colors ${
            isOpen || currentPath
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
          }`}
        >
          <span>{currentPath ? pathLabel : 'All Categories'}</span>
          {currentPath && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleNavigate(null)
              }}
              className="ml-1 rounded hover:bg-blue-100 p-0.5 transition-colors"
              title="Show all categories"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {!currentPath && (
            <ChevronRight
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
          )}
        </button>

        {/* Floating cascade menu */}
        {isOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-50 flex"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.12))' }}
          >
            {/* L1 column */}
            <div className="bg-white rounded-lg border border-gray-200 min-w-[200px] max-h-80 overflow-y-auto py-1">
              {/* All categories */}
              <button
                onClick={() => handleNavigate(null)}
                className="w-full text-left px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 border-b border-gray-100 transition-colors"
              >
                All Categories
              </button>

              {loadingL1 ? (
                <div className="px-4 py-5 flex justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                </div>
              ) : (
                l1Categories.map((l1) => (
                  <button
                    key={l1.full_path}
                    onMouseEnter={() => {
                      cancelClose()
                      setHoveredL1(l1.has_children ? l1.full_path : null)
                    }}
                    onMouseLeave={scheduleClose}
                    onClick={() => handleNavigate(l1.full_path)}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                      hoveredL1 === l1.full_path
                        ? 'bg-blue-50 text-blue-700'
                        : currentPath === l1.full_path
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{l1.category_level1 || l1.full_path}</span>
                    {l1.has_children && (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* L2 column — flies out to the right when L1 is hovered */}
            {hoveredL1 && (
              <div
                className="bg-white rounded-lg border border-gray-200 min-w-[200px] max-h-80 overflow-y-auto py-1 ml-0.5"
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                {/* "All in [L1]" header row */}
                <button
                  onClick={() => handleNavigate(hoveredL1)}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 border-b border-gray-100 uppercase tracking-wide transition-colors"
                >
                  All in {l1Categories.find((l) => l.full_path === hoveredL1)?.category_level1 ?? hoveredL1}
                </button>

                {loadingL2 ? (
                  <div className="px-4 py-5 flex justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  </div>
                ) : l2Items && l2Items.length > 0 ? (
                  l2Items.map((l2) => (
                    <button
                      key={l2.full_path}
                      onClick={() => handleNavigate(l2.full_path)}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                        currentPath === l2.full_path
                          ? 'bg-blue-100 text-blue-800 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="truncate">{l2.category_level2 || l2.full_path}</span>
                      {l2.has_children && (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                      )}
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-400 italic">No subcategories</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Include subcategories toggle */}
      <div className="ml-auto shrink-0">
        <button
          onClick={() => onToggleNodeOnly(!nodeOnlyMode)}
          title="Shows data from each category and all its subcategories combined."
          className={`inline-flex items-center gap-2 text-xs font-medium rounded-md px-3 py-1.5 border transition-colors ${
            !nodeOnlyMode
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Layers className="w-3 h-3" />
          Include subcategories
          <span
            className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
              !nodeOnlyMode ? 'bg-indigo-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                !nodeOnlyMode ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>
    </div>
  )
}
