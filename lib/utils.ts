import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB').format(value)
}

/**
 * Formats a decimal rate (0.0 to 1.0) as a percentage string.
 * @param value - A decimal rate where 0.01 represents 1%
 * @returns Formatted percentage string (e.g., "1.5%")
 * @example formatPercent(0.015) // returns "1.5%"
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
