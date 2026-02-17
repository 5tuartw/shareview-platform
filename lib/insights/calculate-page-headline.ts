import type { PageHeadlineData } from '@/types/page-insights'

interface OverviewMetrics {
  gmv_change_pct: number | null
  roi: number | null
  periodLabel: string
}

interface SearchTermsMetrics {
  totalKeywords: number
  highPerformers: number
  avgCVR: number
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

export const calculateSearchTermsHeadline = (metrics: SearchTermsMetrics): PageHeadlineData => {
  const highPerformerRate = metrics.totalKeywords > 0 ? metrics.highPerformers / metrics.totalKeywords : 0
  const avgCVR = metrics.avgCVR

  let status: PageHeadlineData['status'] = 'warning'

  if (highPerformerRate > 0.6 && avgCVR > 6) {
    status = 'success'
  } else if (highPerformerRate > 0.4 || avgCVR > 4) {
    status = 'warning'
  } else {
    status = 'critical'
  }

  const highPerformerPercentage = Math.round(highPerformerRate * 100)
  const message = `${highPerformerPercentage}% of keywords above target CVR`
  const subtitle = `Average CVR is ${avgCVR.toFixed(1)}% across ${metrics.totalKeywords} keywords`

  return {
    status,
    message,
    subtitle,
  }
}
