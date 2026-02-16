import {
  CalculationResult,
  ContextualInfoData,
  CoverageSnapshot,
  DomainMetricRecord,
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

const getHeadlineStatus = (coverage: number): 'success' | 'warning' | 'critical' => {
  if (coverage > 80) return 'success'
  if (coverage >= 60) return 'warning'
  return 'critical'
}

export function buildCoverageMetrics(
  snapshot: CoverageSnapshot | null,
  periodStart: string,
  periodEnd: string
): CalculationResult {
  if (!snapshot) {
    return { metrics: [], errors: ['Missing coverage snapshot for coverage metrics'] }
  }

  const coveragePct = snapshot.coverage_pct ?? 0

  const headline: PageHeadlineData = {
    status: getHeadlineStatus(coveragePct),
    message: `${formatPercent(coveragePct)} of products have visibility`,
    subtitle: `${formatNumber(snapshot.active_products ?? 0)} active products`,
  }

  const quickStats: QuickStatsData = {
    items: [
      {
        label: 'Total Products',
        value: formatNumber(snapshot.total_products ?? 0),
        color: '#0ea5e9',
      },
      {
        label: 'Active Products',
        value: formatNumber(snapshot.active_products ?? 0),
        color: '#10b981',
      },
      {
        label: 'Zero Visibility',
        value: formatNumber(snapshot.zero_visibility_products ?? 0),
        color: '#ef4444',
      },
      {
        label: 'Coverage',
        value: formatPercent(coveragePct),
        color: '#10b981',
      },
    ],
  }

  const topCategory = snapshot.top_category as Record<string, unknown> | null
  const biggestGap = snapshot.biggest_gap as Record<string, unknown> | null

  const contextual: ContextualInfoData = {
    title: 'Coverage Opportunities',
    style: 'warning',
    items: [
      {
        label: 'Top category',
        text: `${topCategory?.name ?? 'Unknown'} (${formatPercent((topCategory?.coverage_pct as number) ?? 0)})`,
      },
      {
        label: 'Biggest gap',
        text: `${biggestGap?.name ?? 'Unknown'} (${formatNumber((biggestGap?.zero_visibility_count as number) ?? 0)} zero visibility)`,
      },
    ],
  }

  const metrics: DomainMetricRecord[] = [
    {
      retailerId: snapshot.retailer_id,
      pageType: 'coverage',
      tabName: 'coverage',
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
      pageType: 'coverage',
      tabName: 'coverage',
      periodType: 'month',
      periodStart,
      periodEnd,
      componentType: 'quick_stats',
      componentData: quickStats,
      sourceSnapshotId: snapshot.id,
      calculationMethod: 'algorithmic',
      isActive: true,
    },
    {
      retailerId: snapshot.retailer_id,
      pageType: 'coverage',
      tabName: 'coverage',
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
