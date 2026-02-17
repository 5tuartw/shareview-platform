'use client'

import React, { useState, useMemo } from 'react';
import { Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { COLORS } from '@/lib/colors';
import { ColumnDefinition } from '@/lib/column-config';
import { formatCurrency, formatNumber, formatPercent, formatPence, formatPercentageValue } from '@/lib/utils';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
  color?: string;
}

interface PerformanceTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: ColumnDefinition[];
  filters?: FilterOption[];
  defaultFilter?: string;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  pageSize?: number;
  onRowClick?: (row: T) => void;
  onFilterChange?: (filter: string) => void;
  onSortChange?: (key: string, direction: 'asc' | 'desc') => void;
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
  const [activeFilter, setActiveFilter] = useState(defaultFilter);
  const [sortKey, setSortKey] = useState(defaultSort?.key || '');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSort?.direction || 'desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);

  const handleFilterClick = (filterKey: string) => {
    setActiveFilter(filterKey);
    setCurrentPage(1);
    onFilterChange?.(filterKey);
  };

  const handleSort = (columnKey: string) => {
    const newDirection = sortKey === columnKey && sortDirection === 'desc' ? 'asc' : 'desc';
    setSortKey(columnKey);
    setSortDirection(newDirection);
    onSortChange?.(columnKey, newDirection);
  };

  const formatValue = (value: unknown, type: ColumnDefinition['type'], field?: string): React.ReactNode => {
    if (value === null || value === undefined) return '-';

    const normaliseNumber = (val: unknown): number | null => {
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (typeof val === 'string') {
        const parsed = Number(val);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    // Special handling for EPC and CPC fields - format as pence
    if (field && ['epc', 'validated_epc', 'net_epc', 'cpc'].includes(field)) {
      const numeric = normaliseNumber(value);
      return numeric === null ? '-' : formatPence(numeric);
    }

    // Special handling for ROI - it's stored as a percentage value (35.24 = 35.24%), not decimal
    if (field === 'roi') {
      const numeric = normaliseNumber(value);
      return numeric === null ? '-' : formatPercentageValue(numeric);
    }

    switch (type) {
      case 'currency': {
        const numeric = normaliseNumber(value);
        return numeric === null ? '-' : formatCurrency(numeric);
      }
      case 'percent': {
        const numeric = normaliseNumber(value);
        return numeric === null ? '-' : formatPercent(numeric);
      }
      case 'number': {
        const numeric = normaliseNumber(value);
        return numeric === null ? '-' : formatNumber(numeric);
      }
      case 'date':
        if (typeof value === 'string') {
          const date = new Date(value);
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return String(value);
      default:
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return value;
        }
        return String(value);
    }
  };

  const getSortIcon = (columnKey: string) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4" style={{ color: COLORS.textPrimary }} />
      : <ArrowDown className="w-4 h-4" style={{ color: COLORS.textPrimary }} />;
  };

  // Sort the data
  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = sortedData.slice(startIndex, endIndex);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Filter Pills */}
      {filters.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter by Status:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {filters.map((filter) => {
              const isActive = activeFilter === filter.value;
              const FilterIcon = filter.icon;
              const filterCount = filter.count !== undefined ? ` (${filter.count})` : '';

              return (
                <button
                  key={filter.value}
                  onClick={() => handleFilterClick(filter.value)}
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
                  {filter.label}{filterCount}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-max w-full">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
            <tr>
              {columns.map((column, idx) => {
                const align = column.align || (column.type === 'number' || column.type === 'currency' || column.type === 'percent' ? 'right' : 'left');
                const sortable = column.sortable !== false; // Default to true unless explicitly false
                return (
                  <th
                    key={column.field}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${
                      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                    } ${idx === 0 ? 'sticky left-0 z-30 bg-gray-50' : ''}`}
                    style={{ color: COLORS.textMuted }}
                  >
                    {sortable ? (
                      <button
                        onClick={() => handleSort(column.field)}
                        className="flex items-center gap-2 hover:text-gray-900 transition-colors"
                      >
                        {column.display}
                        {getSortIcon(column.field)}
                      </button>
                    ) : (
                      column.display
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedData.map((row, rowIdx) => (
              <tr 
                key={rowIdx} 
                className="group hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column, colIdx) => {
                  const align = column.align || (column.type === 'number' || column.type === 'currency' || column.type === 'percent' ? 'right' : 'left');
                  const isNumeric = column.type === 'number' || column.type === 'currency' || column.type === 'percent';
                  return (
                    <td
                      key={column.field}
                      className={`px-4 py-3 text-sm ${
                        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                      } ${isNumeric ? 'font-mono' : ''} ${colIdx === 0 ? 'sticky left-0 z-10 bg-white group-hover:bg-gray-50' : ''}`}
                      style={{ color: COLORS.textSecondary }}
                    >
                      {column.render 
                        ? column.render(row, column)
                        : formatValue((row as Record<string, unknown>)[column.field], column.type, column.field)
                      }
                    </td>
                  );
                })}
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
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
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
  );
}
