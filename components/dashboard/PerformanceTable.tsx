'use client'

import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ExternalLink, Settings } from 'lucide-react';
import { ColumnDefinition } from '@/lib/column-config';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

interface FilterOption {
  value: string;
  label: string;
}

interface PerformanceTableProps<T extends Record<string, any>> {
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

export default function PerformanceTable<T extends Record<string, any>>({
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
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSort?.direction || 'asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter data
  const filteredData = useMemo(() => {
    if (!filters.length || activeFilter === 'all') return data;
    
    return data.filter(row => {
      const status = row.status?.toLowerCase();
      return status === activeFilter.toLowerCase();
    });
  }, [data, activeFilter, filters]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === 'asc' 
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [filteredData, sortKey, sortDirection]);

  // Paginate data
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    const newDirection = sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortKey(key);
    setSortDirection(newDirection);
    onSortChange?.(key, newDirection);
  };

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setCurrentPage(1);
    onFilterChange?.(filter);
  };

  const formatValue = (value: any, type: ColumnDefinition['type']) => {
    if (value === null || value === undefined) return '-';

    switch (type) {
      case 'currency':
        return formatCurrency(value);
      case 'percent':
        return formatPercent(value);
      case 'number':
        return formatNumber(value);
      case 'date':
        if (typeof value === 'string') {
          const date = new Date(value);
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return value;
      default:
        return value;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Filter Pills */}
      {filters.length > 0 && (
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-2">
          {filters.map(filter => (
            <button
              key={filter.value}
              onClick={() => handleFilterChange(filter.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeFilter === filter.value
                  ? 'bg-[#1B1C1B] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map(col => (
                <th
                  key={col.field}
                  onClick={() => handleSort(col.field)}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.display}
                    {sortKey === col.field && (
                      sortDirection === 'asc' 
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedData.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={`${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
              >
                {columns.map(col => (
                  <td key={col.field} className="px-4 py-3 text-sm">
                    {col.field === 'retailer_name' ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row[col.field]}</span>
                        {row.alert_count > 0 && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                            {row.alert_count}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className={col.type === 'number' || col.type === 'currency' || col.type === 'percent' ? 'font-mono' : ''}>
                        {formatValue(row[col.field], col.type)}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/client/${row.retailer_id}`;
                      }}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="View Dashboard"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/client/${row.retailer_id}?tab=account-management`;
                      }}
                      className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="Manage Account"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
