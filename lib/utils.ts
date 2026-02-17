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
 * Formats a value in pence as a pence string (e.g., "68p" for 0.68).
 * Used for EPC and similar small monetary values.
 * @param value - Value in pounds (e.g., 0.68)
 * @returns Formatted pence string (e.g., "68p")
 * @example formatPence(0.68) // returns "68p"
 * @example formatPence(1.23) // returns "123p"
 */
export function formatPence(value: number): string {
  const pence = Math.round(value * 100);
  return `${pence}p`;
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

/**
 * Formats an already-percentage value (e.g., 35.24 meaning 35.24%) to 1 decimal place.
 * Used for ROI which is stored as a percentage, not a decimal.
 * @param value - A percentage value (e.g., 35.24 for 35.24%)
 * @returns Formatted percentage string (e.g., "35.2%")
 * @example formatPercentageValue(35.246621992749645) // returns "35.2%"
 */
export function formatPercentageValue(value: number): string {
  return `${value.toFixed(1)}%`
}