/**
 * Recharts Configuration Constants
 * Consistent styling for all charts across the portal
 */

import { COLORS } from './colors'

export const CHART_COLORS = {
  primary: COLORS.chartPrimary,
  secondary: COLORS.chartSecondary,
  warning: COLORS.chartWarning,
  critical: COLORS.chartCritical,
} as const

export const CHART_GRID_STYLES = {
  strokeDasharray: '3 3',
  stroke: '#f0f0f0',
} as const

export const AXIS_STYLES = {
  tick: { fill: '#6b7280', fontSize: 12 },
  tickLine: { stroke: '#e5e7eb' },
} as const

export const TOOLTIP_STYLES = {
  contentStyle: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '12px',
  },
} as const

export const LEGEND_STYLES = {
  wrapperStyle: {
    fontSize: '12px',
    paddingTop: '10px',
  },
} as const

/**
 * Format currency values for chart axes/tooltips
 */
export const formatCurrency = (value: number): string => {
  if (value >= 1000) {
    return `£${(value / 1000).toFixed(0)}k`
  }
  return `£${value.toFixed(0)}`
}

/**
 * Format percentage values for chart axes/tooltips
 */
export const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`
}

/**
 * Format large numbers with k/M suffix
 */
export const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}k`
  }
  return value.toString()
}

/**
 * Conditional color based on value threshold
 */
export const getConditionalColor = (
  value: number,
  threshold: number,
  goodIsHigh: boolean = true
): string => {
  if (goodIsHigh) {
    return value >= threshold ? COLORS.success : COLORS.warning
  } else {
    return value <= threshold ? COLORS.success : COLORS.warning
  }
}

/**
 * Get color for negative/positive values
 */
export const getValueColor = (value: number): string => {
  return value >= 0 ? COLORS.success : COLORS.critical
}
