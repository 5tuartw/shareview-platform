import {
  CalculationResult,
  ContextualInfoData,
  DomainMetricRecord,
  MetricCardData,
  PageHeadlineData,
  ProductSnapshot,
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
  if (share > 50) return 'success'
  if (share >= 30) return 'warning'
  return 'critical'
}

export function buildProductsMetrics(
  snapshot: ProductSnapshot | null,
  previous: ProductSnapshot | null,
  periodStart: string,
  periodEnd: string
): CalculationResult {
  if (!snapshot) {
    return { metrics: [], errors: ['Missing product snapshot for products metrics'] }
  }

  const starCount = snapshot.star_count ?? 0
  const goodCount = snapshot.good_count ?? 0
  const totalProducts = snapshot.total_products ?? 0
  const topShare = totalProducts > 0 ? ((starCount + goodCount) / totalProducts) * 100 : 0

  const headline: PageHeadlineData = {
    status: getHeadlineStatus(topShare),
    message: `${topShare.toFixed(1)}% of products are star or good`,
    subtitle: `${formatNumber(starCount + goodCount)} strong performers out of ${formatNumber(totalProducts)}`,
  }

  const cardData: MetricCardData = {
    cards: [
      {
        label: 'Total Products',
        value: formatNumber(totalProducts),
        change: percentChange(totalProducts, previous?.total_products ?? null),
        status: getStatusFromChange(percentChange(totalProducts, previous?.total_products ?? null)),
      },
      {
        label: 'Star Performers',
        value: formatNumber(starCount),
        change: percentChange(starCount, previous?.star_count ?? null),
        status: getStatusFromChange(percentChange(starCount, previous?.star_count ?? null)),
      },
      {
        label: 'Avg CVR',
        value: formatPercent(snapshot.avg_cvr ?? 0),
        change: percentChange(snapshot.avg_cvr, previous?.avg_cvr ?? null),
        status: getStatusFromChange(percentChange(snapshot.avg_cvr, previous?.avg_cvr ?? null)),
      },
      {
        label: 'Total Conversions',
        value: formatNumber(snapshot.total_conversions ?? 0),
        change: percentChange(snapshot.total_conversions, previous?.total_conversions ?? null),
        status: getStatusFromChange(percentChange(snapshot.total_conversions, previous?.total_conversions ?? null)),
      },
    ],
  }

  const quickStats: QuickStatsData = {
    items: [
      {
        label: 'Top 1% Share',
        value: formatPercent(snapshot.top_1_pct_conversions_share ?? 0),
        color: '#10b981',
      },
      {
        label: 'Top 5% Share',
        value: formatPercent(snapshot.top_5_pct_conversions_share ?? 0),
        color: '#10b981',
      },
      {
        label: 'Top 10% Share',
        value: formatPercent(snapshot.top_10_pct_conversions_share ?? 0),
        color: '#10b981',
      },
      {
        label: 'Wasted Clicks',
        value: formatPercent(snapshot.wasted_clicks_percentage ?? 0),
        color: '#f59e0b',
      },
    ],
  }

  const contextualItems: ContextualInfoData | null =
    (snapshot.wasted_clicks_percentage ?? 0) > 10
      ? {
          title: 'Wasted Clicks Warning',
          style: 'warning',
          items: [
            {
              label: 'Products with wasted clicks',
              text: formatNumber(snapshot.products_with_wasted_clicks ?? 0),
            },
            {
              label: 'Total wasted clicks',
              text: formatNumber(snapshot.total_wasted_clicks ?? 0),
            },
          ],
        }
      : null

  const metrics: DomainMetricRecord[] = [
    {
      retailerId: snapshot.retailer_id,
      pageType: 'products',
      tabName: 'products',
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
      pageType: 'products',
      tabName: 'products',
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
      pageType: 'products',
      tabName: 'products',
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

  if (contextualItems) {
    metrics.push({
      retailerId: snapshot.retailer_id,
      pageType: 'products',
      tabName: 'products',
      periodType: 'month',
      periodStart,
      periodEnd,
      componentType: 'contextual_info',
      componentData: contextualItems,
      sourceSnapshotId: snapshot.id,
      calculationMethod: 'algorithmic',
      isActive: true,
    })
  }

  return { metrics, errors: [] }
}
