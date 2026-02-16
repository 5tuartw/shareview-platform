import {
  CalculationResult,
  DomainMetricRecord,
  KeywordsSnapshot,
  MetricCardData,
  PageHeadlineData,
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

const getHeadlineStatus = (gmvGrowth: number, roi: number): 'success' | 'warning' | 'critical' => {
  if (gmvGrowth > 10 && roi > 5) return 'success'
  if (gmvGrowth > 0 || roi > 0) return 'warning'
  return 'critical'
}

export function buildOverviewMetrics(
  snapshot: KeywordsSnapshot | null,
  previous: KeywordsSnapshot | null,
  periodStart: string,
  periodEnd: string
): CalculationResult {
  if (!snapshot) {
    return { metrics: [], errors: ['Missing keywords snapshot for overview metrics'] }
  }

  const currentConversions = snapshot.total_conversions ?? 0
  const previousConversions = previous?.total_conversions ?? 0
  const gmvGrowth = previous ? percentChange(currentConversions, previousConversions) ?? 0 : 0

  const roi = snapshot.overall_cvr ?? 0
  const headlineStatus = getHeadlineStatus(gmvGrowth, roi)
  const direction = gmvGrowth >= 0 ? 'up' : 'down'
  const periodLabel = new Date(periodStart).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const headline: PageHeadlineData = {
    status: headlineStatus,
    message: `GMV ${direction} ${Math.abs(gmvGrowth).toFixed(1)}% in ${periodLabel}`,
    subtitle: `ROI: ${formatPercent(roi)}, ${formatNumber(snapshot.total_keywords)} total keywords`,
  }

  const cardData: MetricCardData = {
    cards: [
      {
        label: 'Total Keywords',
        value: formatNumber(snapshot.total_keywords ?? 0),
        change: percentChange(snapshot.total_keywords, previous?.total_keywords ?? null),
        status: getStatusFromChange(percentChange(snapshot.total_keywords, previous?.total_keywords ?? null)),
      },
      {
        label: 'High Performers',
        value: formatNumber((snapshot.tier_star_count ?? 0) + (snapshot.tier_strong_count ?? 0)),
        change: percentChange(
          (snapshot.tier_star_count ?? 0) + (snapshot.tier_strong_count ?? 0),
          (previous?.tier_star_count ?? 0) + (previous?.tier_strong_count ?? 0)
        ),
        status: getStatusFromChange(percentChange(
          (snapshot.tier_star_count ?? 0) + (snapshot.tier_strong_count ?? 0),
          (previous?.tier_star_count ?? 0) + (previous?.tier_strong_count ?? 0)
        )),
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

  const metrics: DomainMetricRecord[] = [
    {
      retailerId: snapshot.retailer_id,
      pageType: 'overview',
      tabName: 'overview',
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
      pageType: 'overview',
      tabName: 'overview',
      periodType: 'month',
      periodStart,
      periodEnd,
      componentType: 'metric_card',
      componentData: cardData,
      sourceSnapshotId: snapshot.id,
      calculationMethod: 'algorithmic',
      isActive: true,
    },
  ]

  return { metrics, errors: [] }
}
