import type { PageHeadlineData } from '@/types/page-insights'

interface OverviewMetrics {
  gmv_change_pct: number | null
  roi: number | null
  periodLabel: string
}

export const calculateOverviewHeadline = (metrics: OverviewMetrics): PageHeadlineData => {
  const gmvChange = metrics.gmv_change_pct ?? 0
  const roi = metrics.roi ?? 0

  let status: PageHeadlineData['status'] = 'warning'

  if (gmvChange > 10 && roi > 5) {
    status = 'success'
  } else if (gmvChange < 0 || roi < 0) {
    status = 'critical'
  }

  const changeLabel = Math.abs(gmvChange).toFixed(1)
  const changeText = gmvChange >= 0 ? `up ${changeLabel}%` : `down ${changeLabel}%`

  const messageMap: Record<PageHeadlineData['status'], string> = {
    success: `Strong performance in ${metrics.periodLabel} - GMV ${changeText}`,
    warning: `Moderate performance in ${metrics.periodLabel} - GMV ${changeText}`,
    critical: `Performance declined in ${metrics.periodLabel} - GMV ${changeText}`,
    info: `Performance overview for ${metrics.periodLabel}`,
  }

  const subtitle = roi >= 0
    ? `ROI is holding at ${roi.toFixed(1)}% for the period.`
    : `ROI is down to ${roi.toFixed(1)}% for the period.`

  return {
    status,
    message: messageMap[status],
    subtitle,
  }
}
