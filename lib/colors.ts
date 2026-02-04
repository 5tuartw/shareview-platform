/**
 * Design System Color Constants
 * Based on Shareight brand and Cur8or accent colors
 */

export const COLORS = {
  // Primary Brand Colors
  header: '#1C1D1C',           // Shareight dark grey
  amber: '#F59E0B',            // Cur8or amber/orange
  deepAmber: '#D97706',        // Darker amber for hover
  lightAmber: '#FEF3C7',       // Light amber background
  
  // Status Colors (4-color system)
  success: '#14B8A6',          // Teal-500
  warning: '#F59E0B',          // Amber-500 (matches Cur8or)
  critical: '#DC2626',         // Red-600 (deeper, warmer red)
  neutral: '#FEFCE8',          // Yellow-50 (pale cream/beige)
  
  // Competitive/Secondary Color
  blue: '#2563EB',             // Blue-600 for competitive insights
  
  // Text Hierarchy (Shareight dark progressions)
  textPrimary: '#1C1D1C',      // Matches header
  textSecondary: '#52534F',    // Paler variation
  textMuted: '#787977',        // Even paler
  textDisabled: '#A8A9A8',     // Lightest
  
  // Background Colors
  bgLight: '#F3F4F6',          // Gray-100
  bgWhite: '#FFFFFF',
  
  // Chart Colors (Recharts)
  chartPrimary: '#14B8A6',     // Teal
  chartSecondary: '#2563EB',   // Blue
  chartWarning: '#F59E0B',     // Amber
  chartCritical: '#DC2626',    // Red
  
  // Performance Tier Colors
  star: '#14B8A6',             // Teal
  strong: '#14B8A6',           // Teal (same as star)
  moderate: '#787977',         // Muted grey
  underperforming: '#F59E0B',  // Amber
  
  // Background Tints
  successBg: '#F0FDFA',        // Teal-50
  warningBg: '#FFFBEB',        // Amber-50
  criticalBg: '#FEF2F2',       // Red-50
  blueBg: '#EFF6FF',           // Blue-50
  tealBg: '#F0FDFA',           // Teal-50
  
  // Darker Variants
  successDark: '#0F766E',      // Teal-700
  warningDark: '#B45309',      // Amber-700
  criticalDark: '#991B1B',     // Red-800
  blueDark: '#1E40AF',         // Blue-800
  tealDark: '#0D9488',         // Teal-600
} as const

export type ColorKey = keyof typeof COLORS
