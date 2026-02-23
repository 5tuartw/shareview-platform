'use client'

import React from 'react'
import { ChevronRight, Home, Folder, FolderOpen } from 'lucide-react'

interface CategoryNavigatorProps {
  currentPath: string | null
  onNavigate: (path: string | null) => void
  nodeOnlyMode: boolean
  onToggleNodeOnly: (enabled: boolean) => void
}

export default function CategoryNavigator({
  currentPath,
  onNavigate,
  nodeOnlyMode,
  onToggleNodeOnly,
}: CategoryNavigatorProps) {
  const breadcrumbs = currentPath ? currentPath.split(' > ') : []

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Root level
      onNavigate(null)
    } else {
      // Navigate to intermediate level
      const path = breadcrumbs.slice(0, index + 1).join(' > ')
      onNavigate(path)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-4">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => handleBreadcrumbClick(-1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              !currentPath
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
            aria-label="Navigate to root categories"
          >
            <Home className="w-4 h-4" />
            <span>All Categories</span>
          </button>

          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors truncate ${
                  index === breadcrumbs.length - 1
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                title={crumb}
              >
                {index === breadcrumbs.length - 1 ? (
                  <FolderOpen className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="truncate">{crumb}</span>
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Node-Only Toggle */}
        <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
          <label className="flex items-center gap-2 cursor-pointer group">
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Include subcategories
            </span>
            <div className="relative">
              <input
                type="checkbox"
                checked={!nodeOnlyMode}
                onChange={(e) => onToggleNodeOnly(!e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </div>
          </label>
          <div className="group relative">
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 cursor-help"
              aria-label="Help with category metrics"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
              <p className="mb-2 font-semibold">Category Metrics:</p>
              <ul className="space-y-1">
                <li>
                  <strong>Include subcategories ON:</strong> Shows performance for this category plus all
                  child categories (branch metrics)
                </li>
                <li>
                  <strong>Include subcategories OFF:</strong> Shows only products specifically in this
                  category, excluding children (node metrics)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
