import { PERFORMANCE_TIERS } from '../../../lib/performanceTiers'
import {
  CalculationResult,
  DomainMetricRecord,
  KeywordsSnapshot,
  MetricCardData,
  PageHeadlineData,
  QuickStatsData,
} from '../types'

const toNumber = (value: number | string | null): number | null => {
  if (value === null || value === undefined) return null
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : value
  return Number.isNaN(numeric) ? null : numeric
}

const formatNumber = (value: number | string | null): string => {
  const numeric = toNumber(value)
  if (numeric === null) return '0'
  return new Intl.NumberFormat('en-GB').format(numeric)
}

const formatPercent = (value: number | string | null): string => {
  const numeric = toNumber(value)
  if (numeric === null) return '0%'
  return `${numeric.toFixed(1)}%`
}

const percentChange = (current: number | string | null, previous: number | string | null): number | null => {
  const currentValue = toNumber(current)
  const previousValue = toNumber(previous)
  if (currentValue === null || previousValue === null || previousValue === 0) return null
  return ((currentValue - previousValue) / previousValue) * 100
}

const getStatusFromChange = (change: number | null): 'success' | 'warning' | 'critical' => {
  if (change === null) return 'warning'
  if (change >= 5) return 'success'
  if (change >= 0) return 'warning'
  return 'critical'
}

const getHeadlineStatus = (share: number): 'success' | 'warning' | 'critical' => {
  if (share > 60) return 'success'
  if (share >= 40) return 'warning'
  return 'critical'
}

export function buildKeywordsMetrics(
  snapshot: KeywordsSnapshot | null,
  previous: KeywordsSnapshot | null,
  periodStart: string,
  periodEnd: string
): CalculationResult {
  if (!snapshot) {
    return { metrics: [], errors: ['Missing keywords snapshot for keywords metrics'] }
  }

  const starCount = snapshot.tier_star_count ?? 0
  const strongCount = snapshot.tier_strong_count ?? 0
  const underperformingCount = snapshot.tier_underperforming_count ?? 0
  const poorCount = snapshot.tier_poor_count ?? 0
  const totalKeywords = snapshot.total_keywords ?? 0
  const highPerformers = starCount + strongCount
  const highShare = totalKeywords > 0 ? (highPerformers / totalKeywords) * 100 : 0

  const headline: PageHeadlineData = {
    status: getHeadlineStatus(highShare),
    message: `${highShare.toFixed(1)}% of keywords are star or strong`,
    subtitle: `${formatNumber(highPerformers)} high performers out of ${formatNumber(totalKeywords)}`,
  }

  const cardData: MetricCardData = {
    cards: [
      {
        label: 'Total Keywords',
        value: formatNumber(totalKeywords),
        change: percentChange(totalKeywords, previous?.total_keywords ?? null),
        status: getStatusFromChange(percentChange(totalKeywords, previous?.total_keywords ?? null)),
      },
      {
        label: 'High Performers',
        value: formatNumber(highPerformers),
        change: percentChange(highPerformers, (previous?.tier_star_count ?? 0) + (previous?.tier_strong_count ?? 0)),
        status: getStatusFromChange(percentChange(highPerformers, (previous?.tier_star_count ?? 0) + (previous?.tier_strong_count ?? 0))),
      },
      {
        label: 'Avg CVR',
        value: formatPercent(snapshot.overall_cvr ?? 0),
        change: percentChange(snapshot.overall_cvr, previous?.overall_cvr ?? null),
        status: getStatusFromChange(percentChange(snapshot.overall_cvr, previous?.overall_cvr ?? null)),
      },
      {
        label: 'Total Impressions',
        value: formatNumber(snapshot.total_impressions ?? 0),
        change: percentChange(snapshot.total_impressions, previous?.total_impressions ?? null),
        status: getStatusFromChange(percentChange(snapshot.total_impressions, previous?.total_impressions ?? null)),
      },
    ],
  }

  const quickStats: QuickStatsData = {
    items: [
      {
        label: 'Star Tier',
        value: formatNumber(starCount),
        color: PERFORMANCE_TIERS.star.color,
      },
      {
        label: 'Strong Tier',
        value: formatNumber(strongCount),
        color: PERFORMANCE_TIERS.strong.color,
      },
      {
        label: 'Underperforming',
        value: formatNumber(underperformingCount),
        color: PERFORMANCE_TIERS.underperforming.color,
      },
      {
        label: 'Poor',
        value: formatNumber(poorCount),
        color: PERFORMANCE_TIERS.critical.color,
      },
    ],
  }

  const metrics: DomainMetricRecord[] = [
    {
      retailerId: snapshot.retailer_id,
      pageType: 'keywords',
      tabName: 'keywords',
      periodType: 'month',
      periodStart,
      periodEnd,
      componentType: 'page_headline',
      componentData: headline,
      sourceSnapshotId: snapshot.id,
      calculationMethod: 'algorithmic',
      isActive: true,
    },
    {
      retailerId: snapshot.retailer_id,
      pageType: 'keywords',
      tabName: 'keywords',
      periodType: 'month',
      periodStart,
      periodEnd,
      componentType: 'metric_card',
      componentData: cardData,
      sourceSnapshotId: snapshot.id,
      calculationMethod: 'algorithmic',
      isActive: true,
    },
    {
      retailerId: snapshot.retailer_id,
      pageType: 'keywords',
      tabName: 'keywords',
      periodType: 'month',
      periodStart,
      periodEnd,
      componentType: 'quick_stats',
      componentData: quickStats,
      sourceSnapshotId: snapshot.id,
      calculationMethod: 'algorithmic',
      isActive: true,
    },
  ]

  return { metrics, errors: [] }
}
