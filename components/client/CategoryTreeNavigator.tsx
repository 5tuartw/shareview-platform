'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronRight, X, Layers } from 'lucide-react'
import { fetchCategoryPerformance } from '@/lib/api-client'
import type { CategoryData } from '@/types'

interface CategoryTreeNavigatorProps {
  retailerId: string
  currentPath: string | null
  onNavigate: (path: string | null, isLeaf: boolean) => void
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
  // children[parentPath] = array of CategoryData; '' = root (L1)
  const [childrenCache, setChildrenCache] = useState<Record<string, CategoryData[]>>({})
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())
  // Stack of hovered full_paths: [hoveredL1, hoveredL2, ...] — length = number of open flyout columns
  const [hoveredStack, setHoveredStack] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => setHoveredStack([]), 200)
  }

  // Load children for a given parent_path ('' = root depth-1 items)
  const loadChildren = useCallback(async (parentKey: string) => {
    if (childrenCache[parentKey] !== undefined || loadingKeys.has(parentKey)) return
    setLoadingKeys((prev) => new Set(prev).add(parentKey))
    try {
      const params = parentKey === ''
        ? { depth: 1, period }
        : { parent_path: parentKey, period }
      const result = await fetchCategoryPerformance(retailerId, params)
      setChildrenCache((prev) => ({ ...prev, [parentKey]: result.categories }))
    } catch (err) {
      console.error('Failed to load categories', err)
      setChildrenCache((prev) => ({ ...prev, [parentKey]: [] }))
    } finally {
      setLoadingKeys((prev) => { const s = new Set(prev); s.delete(parentKey); return s })
    }
  }, [childrenCache, loadingKeys, retailerId, period])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHoveredStack([])
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Load root when menu opens
  useEffect(() => {
    if (isOpen) loadChildren('')
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load children whenever a new level is hovered
  useEffect(() => {
    if (hoveredStack.length > 0) {
      loadChildren(hoveredStack[hoveredStack.length - 1])
    }
  }, [hoveredStack]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset cache when period changes
  useEffect(() => {
    setChildrenCache({})
    setHoveredStack([])
  }, [period])

  const handleNavigate = (path: string | null, isLeaf = false) => {
    onNavigate(path, isLeaf)
    setIsOpen(false)
    setHoveredStack([])
  }

  const handleHoverItem = (item: CategoryData, columnIndex: number) => {
    cancelClose()
    if (item.has_children) {
      // Truncate stack to this column depth and add this item
      setHoveredStack((prev) => [...prev.slice(0, columnIndex), item.full_path])
    } else {
      // No children — close all flyouts to the right of this column
      setHoveredStack((prev) => prev.slice(0, columnIndex))
    }
  }

  const getCategoryLabel = (cat: CategoryData, depth: number): string => {
    const levels = [cat.category_level1, cat.category_level2, cat.category_level3, cat.category_level4, cat.category_level5]
    return levels[depth - 1] || cat.full_path
  }

  const getTierBg = (status: string | null | undefined): string => {
    switch (status) {
      case 'star':          return 'bg-blue-50'
      case 'strong':        return 'bg-teal-50'
      case 'underperforming': return 'bg-amber-50'
      case 'poor':          return 'bg-red-50'
      default:              return ''
    }
  }

  const pathLabel = currentPath ? currentPath.replace(/ > /g, ' › ') : null

  // Build list of columns to render: root column + one per hovered level
  // columnParents[0] = '' (root), columnParents[i] = hoveredStack[i-1]
  const columnParents = ['', ...hoveredStack]

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-3">
      {/* Cascade menu trigger + flyout */}
      <div ref={containerRef} className="relative">
        <button
          onClick={() => {
            setIsOpen((prev) => !prev)
            if (isOpen) setHoveredStack([])
          }}
          className={`flex items-center gap-2 text-sm font-medium rounded-md px-3 py-1.5 border transition-colors ${
            isOpen || currentPath
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
          }`}
        >
          <span>{currentPath ? pathLabel : 'Choose category'}</span>
          {currentPath && (
            <button
              onClick={(e) => { e.stopPropagation(); handleNavigate(null) }}
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

        {/* Floating cascade columns */}
        {isOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-50 flex"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.12))' }}
          >
            {columnParents.map((parentKey, colIdx) => {
              const items = childrenCache[parentKey]
              const isLoading = loadingKeys.has(parentKey)
              const depth = colIdx + 1 // depth of items in this column
              const hoveredInThisCol = hoveredStack[colIdx] ?? null

              return (
                <div
                  key={parentKey || '__root__'}
                  className="bg-white rounded-lg border border-gray-200 min-w-[200px] max-h-80 overflow-y-auto py-1 ml-0.5 first:ml-0"
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                >
                  {colIdx === 0 ? (
                    // Root column: "All Categories" reset button at top
                    <button
                      onClick={() => handleNavigate(null)}
                      className="w-full text-left px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 border-b border-gray-100 transition-colors"
                    >
                      All Categories
                    </button>
                  ) : (
                    // Child columns: "All in [parent]" button at top
                    <button
                      onClick={() => handleNavigate(parentKey)}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 border-b border-gray-100 uppercase tracking-wide transition-colors"
                    >
                      All in {getCategoryLabel(
                        childrenCache[columnParents[colIdx - 1]]?.find((c) => c.full_path === parentKey) ?? { full_path: parentKey } as CategoryData,
                        depth - 1
                      )}
                    </button>
                  )}

                  {isLoading ? (
                    <div className="px-4 py-5 flex justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                    </div>
                  ) : items && items.length > 0 ? (
                    items.map((item) => (
                      <button
                        key={item.full_path}
                        onMouseEnter={() => handleHoverItem(item, colIdx)}
                        onClick={() => handleNavigate(item.full_path, !item.has_children)}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                          hoveredInThisCol === item.full_path
                          ? 'bg-blue-100 text-blue-700'
                          : currentPath === item.full_path
                            ? 'bg-gray-200 text-gray-900 font-medium'
                            : `${getTierBg(item.health_status)} text-gray-700 hover:brightness-95`
                        }`}
                      >
                        <span className="truncate">{getCategoryLabel(item, depth)}</span>
                        {item.has_children && (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                        )}
                      </button>
                    ))
                  ) : (
                    colIdx > 0 && <p className="px-4 py-3 text-sm text-gray-400 italic">No subcategories</p>
                  )}
                </div>
              )
            })}
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
