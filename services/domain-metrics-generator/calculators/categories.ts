import {
  CalculationResult,
  CategorySnapshot,
  ContextualInfoData,
  DomainMetricRecord,
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

const getHeadlineStatus = (healthyShare: number): 'success' | 'warning' | 'critical' => {
  if (healthyShare > 70) return 'success'
  if (healthyShare >= 50) return 'warning'
  return 'critical'
}

const buildCategoryLabel = (category: Record<string, unknown>): string => {
  const levels = [
    category.level1,
    category.level2,
    category.level3,
    category.level4,
    category.level5,
  ].filter(Boolean)
  return levels.join(' > ') || 'Unknown category'
}

export function buildCategoriesMetrics(
  snapshot: CategorySnapshot | null,
  previous: CategorySnapshot | null,
  periodStart: string,
  periodEnd: string
): CalculationResult {
  if (!snapshot) {
    return { metrics: [], errors: ['Missing category snapshot for categories metrics'] }
  }

  const healthyCount = (snapshot.health_healthy_count ?? 0) + (snapshot.health_star_count ?? 0)
  const totalCategories = snapshot.total_categories ?? 0
  const healthyShare = totalCategories > 0 ? (healthyCount / totalCategories) * 100 : 0

  const headline: PageHeadlineData = {
    status: getHeadlineStatus(healthyShare),
    message: `${healthyShare.toFixed(1)}% of categories are healthy or star`,
    subtitle: `${formatNumber(healthyCount)} healthy out of ${formatNumber(totalCategories)}`,
  }

  const cardData: MetricCardData = {
    cards: [
      {
        label: 'Total Categories',
        value: formatNumber(totalCategories),
        change: percentChange(totalCategories, previous?.total_categories ?? null),
        status: getStatusFromChange(percentChange(totalCategories, previous?.total_categories ?? null)),
      },
      {
        label: 'Healthy Categories',
        value: formatNumber(healthyCount),
        change: percentChange(healthyCount, (previous?.health_healthy_count ?? 0) + (previous?.health_star_count ?? 0)),
        status: getStatusFromChange(percentChange(healthyCount, (previous?.health_healthy_count ?? 0) + (previous?.health_star_count ?? 0))),
      },
      {
        label: 'Avg CVR',
        value: formatPercent(snapshot.overall_cvr ?? 0),
        change: percentChange(snapshot.overall_cvr, previous?.overall_cvr ?? null),
        status: getStatusFromChange(percentChange(snapshot.overall_cvr, previous?.overall_cvr ?? null)),
      },
      {
        label: 'Total Conversions',
        value: formatNumber(snapshot.total_conversions ?? 0),
        change: percentChange(snapshot.total_conversions, previous?.total_conversions ?? null),
        status: getStatusFromChange(percentChange(snapshot.total_conversions, previous?.total_conversions ?? null)),
      },
    ],
  }

  const brokenCategories =
    (snapshot.health_summary as Record<string, unknown> | null)?.broken as Record<string, unknown>[] | undefined
  const brokenItems = (brokenCategories || []).slice(0, 3)

  const contextual: ContextualInfoData = {
    title: 'Categories Needing Attention',
    style: 'warning',
    items: brokenItems.map((category) => ({
      label: buildCategoryLabel(category),
      text: 'Broken category performance detected. Review product feed and coverage.',
    })),
  }

  const metrics: DomainMetricRecord[] = [
    {
      retailerId: snapshot.retailer_id,
      pageType: 'categories',
      tabName: 'categories',
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
      pageType: 'categories',
      tabName: 'categories',
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
      pageType: 'categories',
      tabName: 'categories',
      periodType: 'month',
      periodStart,
      periodEnd,
      componentType: 'contextual_info',
      componentData: contextual,
      sourceSnapshotId: snapshot.id,
      calculationMethod: 'algorithmic',
      isActive: true,
    },
  ]

  return { metrics, errors: [] }
}
