import { COLORS } from './colors'

export type PerformanceStatus = 'star' | 'strong' | 'moderate' | 'underperforming' | 'critical'

export interface PerformanceTier {
  status: PerformanceStatus
  label: string
  color: string
  bgColor: string
  minCVR?: number
  maxCVR?: number
}

export const PERFORMANCE_TIERS: Record<PerformanceStatus, PerformanceTier> = {
  star: {
    status: 'star',
    label: 'Star',
    color: COLORS.successDark,
    bgColor: COLORS.successBg,
    minCVR: 4.0,
  },
  strong: {
    status: 'strong',
    label: 'Strong',
    color: COLORS.successDark,
    bgColor: COLORS.successBg,
    minCVR: 3.0,
    maxCVR: 4.0,
  },
  moderate: {
    status: 'moderate',
    label: 'Moderate',
    color: COLORS.textMuted,
    bgColor: '#F3F4F6',
    minCVR: 2.0,
    maxCVR: 3.0,
  },
  underperforming: {
    status: 'underperforming',
    label: 'Underperforming',
    color: COLORS.warningDark,
    bgColor: COLORS.warningBg,
    minCVR: 1.0,
    maxCVR: 2.0,
  },
  critical: {
    status: 'critical',
    label: 'Critical',
    color: COLORS.criticalDark,
    bgColor: COLORS.criticalBg,
    maxCVR: 1.0,
  },
}

export function classifyPerformance(
  cvr: number,
  impressions?: number
): PerformanceStatus {
  const hasSignificantVolume = !impressions || impressions >= 1000

  if (cvr >= 4.0 && hasSignificantVolume) return 'star'
  if (cvr >= 3.0) return 'strong'
  if (cvr >= 2.0) return 'moderate'
  if (cvr >= 1.0) return 'underperforming'
  return 'critical'
}

export function getTierConfig(status: PerformanceStatus): PerformanceTier {
  return PERFORMANCE_TIERS[status]
}

export function countByTier<T extends { cvr: number; impressions?: number }>(
  items: T[]
): Record<PerformanceStatus, number> {
  return items.reduce((acc, item) => {
    const status = classifyPerformance(item.cvr, item.impressions)
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {
    star: 0,
    strong: 0,
    moderate: 0,
    underperforming: 0,
    critical: 0,
  } as Record<PerformanceStatus, number>)
}

export function getStarStrongCount<T extends { cvr: number; impressions?: number }>(
  items: T[]
): number {
  return items.filter(item => {
    const status = classifyPerformance(item.cvr, item.impressions)
    return status === 'star' || status === 'strong'
  }).length
}