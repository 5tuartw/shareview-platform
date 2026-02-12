import React, { useState } from 'react'
import { Filter, LucideIcon, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { COLORS } from '@/lib/colors'

interface FilterOption {
  key: string
  label: string
  count: number
  icon?: LucideIcon
  color?: string
  tooltip?: string
}

interface Column<T> {
  key: keyof T | string
  label: string
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  format?: 'currency' | 'percent' | 'number'
  render?: (row: T) => React.ReactNode
}

interface PerformanceTableProps<T extends Record<string, unknown>> {
  data: T[]
  columns: Column<T>[]
  filters?: FilterOption[]
  defaultFilter?: string
  defaultSort?: { key: string; direction: 'asc' | 'desc' }
  pageSize?: number
  onRowClick?: (row: T) => void
  onFilterChange?: (filter: string) => void
  onSortChange?: (key: string, direction: 'asc' | 'desc') => void
}

export default function PerformanceTable<T extends Record<string, unknown>>({
  data,
  columns,
  filters = [],
  defaultFilter = 'all',
  defaultSort,
  pageSize = 25,
  onRowClick,
  onFilterChange,
  onSortChange,
}: PerformanceTableProps<T>) {
  const [activeFilter, setActiveFilter] = useState(defaultFilter)
  const [sortKey, setSortKey] = useState(defaultSort?.key || '')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSort?.direction || 'desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(pageSize)

  const handleFilterClick = (filterKey: string) => {
    setActiveFilter(filterKey)
    setCurrentPage(1)
    onFilterChange?.(filterKey)
  }

  const handleSort = (columnKey: string) => {
    const newDirection = sortKey === columnKey && sortDirection === 'desc' ? 'asc' : 'desc'
    setSortKey(columnKey)
    setSortDirection(newDirection)
    onSortChange?.(columnKey, newDirection)
  }

  const formatValue = (value: unknown, format?: string) => {
    if (value === null || value === undefined) return '-'
    
    switch (format) {
      case 'currency':
        return typeof value === 'number' ? `£${value.toLocaleString()}` : value
      case 'percent':
        return typeof value === 'number' ? `${value.toFixed(1)}%` : value
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : value
      default:
        return value
    }
  }

  const getSortIcon = (columnKey: string) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-4 h-4 text-gray-400" />
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4" style={{ color: COLORS.textPrimary }} />
      : <ArrowDown className="w-4 h-4" style={{ color: COLORS.textPrimary }} />
  }

  // Sort the data
  const sortedData = React.useMemo(() => {
    if (!sortKey) return data

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // Compare values
      let comparison = 0
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal
      } else {
        comparison = String(aVal).localeCompare(String(bVal))
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [data, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedData.length / rowsPerPage)
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = startIndex + rowsPerPage
  const paginatedData = sortedData.slice(startIndex, endIndex)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Filter Pills */}
      {filters.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter by Performance:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {filters.map((filter) => {
              const isActive = activeFilter === filter.key
              const FilterIcon = filter.icon

              return (
                <button
                  key={filter.key}
                  onClick={() => handleFilterClick(filter.key)}
                  title={filter.tooltip}
                  className="px-3 py-1.5 text-sm font-semibold rounded-full border-2 transition-all hover:shadow-md flex items-center gap-1.5"
                  style={isActive ? {
                    backgroundColor: filter.color || COLORS.textPrimary,
                    borderColor: filter.color || COLORS.textPrimary,
                    color: 'white',
                  } : {
                    backgroundColor: 'white',
                    borderColor: filter.color || '#D1D5DB',
                    color: filter.color || COLORS.textSecondary,
                  }}
                >
                  {FilterIcon && <FilterIcon className="w-3.5 h-3.5" />}
                  {filter.label} ({filter.count})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((column, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${
                    column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                  style={{ color: COLORS.textMuted }}
                >
                  {column.sortable ? (
                    <button
                      onClick={() => handleSort(column.key as string)}
                      className="flex items-center gap-2 hover:text-gray-900 transition-colors"
                    >
                      {column.label}
                      {getSortIcon(column.key as string)}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedData.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`hover:bg-gray-50 transition-colors${onRowClick ? ' cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column, colIdx) => (
                  <td
                    key={colIdx}
                    className={`px-4 py-3 text-sm ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                    style={{ color: COLORS.textSecondary }}
                  >
                    {column.render 
                      ? column.render(row)
                      : formatValue((row as Record<string, unknown>)[column.key as string], column.format)
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table Footer - Pagination */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Rows per page:</span>
            <select
              id="rows-per-page"
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="px-2 py-1 text-sm border border-gray-300 rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ color: COLORS.textPrimary }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <span className="text-sm text-gray-600">
            {startIndex + 1}-{Math.min(endIndex, sortedData.length)} of {sortedData.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm font-medium border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 disabled:text-gray-400"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm font-medium border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 disabled:text-gray-400"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}