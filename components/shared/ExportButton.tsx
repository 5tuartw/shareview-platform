import React from 'react'
import { Download } from 'lucide-react'
import { COLORS } from '@/lib/colors'

type ExportFormat = 'csv' | 'excel'
type ExportVariant = 'primary' | 'secondary' | 'icon-only'

interface ExportButtonProps {
  data: any[]
  filename: string
  format?: ExportFormat
  variant?: ExportVariant
  label?: string
  onExport?: (data: any[], format: ExportFormat) => void
}

export default function ExportButton({
  data,
  filename,
  format = 'csv',
  variant = 'primary',
  label,
  onExport,
}: ExportButtonProps) {
  const handleExport = () => {
    if (onExport) {
      onExport(data, format)
      return
    }

    // Default CSV export implementation
    if (format === 'csv') {
      const headers = Object.keys(data[0] || {})
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          headers.map(header => {
            const value = row[header]
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`
            }
            return value
          }).join(',')
        )
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${filename}.csv`
      link.click()
    }
  }

  const defaultLabel = format === 'csv' ? 'Export CSV' : 'Export Excel'

  if (variant === 'icon-only') {
    return (
      <button
        onClick={handleExport}
        className="p-2 text-sm rounded-lg border border-gray-300 transition-all hover:bg-gray-50 hover:border-gray-400"
        title={label || defaultLabel}
      >
        <Download className="w-4 h-4" style={{ color: COLORS.textSecondary }} />
      </button>
    )
  }

  if (variant === 'secondary') {
    return (
      <button
        onClick={handleExport}
        className="px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 border-2 transition-all hover:shadow-md hover:bg-gray-50"
        style={{
          borderColor: COLORS.textPrimary,
          color: COLORS.textPrimary,
          backgroundColor: 'white',
        }}
      >
        <Download className="w-4 h-4" />
        {label || defaultLabel}
      </button>
    )
  }

  // Primary variant
  return (
    <button
      onClick={handleExport}
      className="px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all hover:shadow-md"
      style={{
        backgroundColor: COLORS.amber,
        color: 'white',
      }}
    >
      <Download className="w-4 h-4" />
      {label || 'Export Data'}
    </button>
  )
}
