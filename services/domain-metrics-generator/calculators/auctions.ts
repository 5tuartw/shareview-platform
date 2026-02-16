import {
  AuctionSnapshot,
  CalculationResult,
  ContextualInfoData,
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

const getHeadlineStatus = (impressionShare: number, overlapRate: number): 'success' | 'warning' | 'critical' => {
  if (impressionShare > 50 && overlapRate > 60) return 'success'
  if (impressionShare > 30 || overlapRate > 40) return 'warning'
  return 'critical'
}

export function buildAuctionsMetrics(
  snapshot: AuctionSnapshot | null,
  periodStart: string,
  periodEnd: string
): CalculationResult {
  if (!snapshot) {
    return { metrics: [], errors: ['Missing auction snapshot for auctions metrics'] }
  }

  const impressionShare = snapshot.avg_impression_share ?? 0
  const overlapRate = snapshot.avg_overlap_rate ?? 0

  const headline: PageHeadlineData = {
    status: getHeadlineStatus(impressionShare, overlapRate),
    message: `Average impression share is ${formatPercent(impressionShare)}`,
    subtitle: `Overlap rate: ${formatPercent(overlapRate)}`,
  }

  const quickStats: QuickStatsData = {
    items: [
      {
        label: 'Avg Impression Share',
        value: formatPercent(snapshot.avg_impression_share ?? 0),
        color: '#10b981',
      },
      {
        label: 'Total Competitors',
        value: formatNumber(snapshot.total_competitors ?? 0),
        color: '#0ea5e9',
      },
      {
        label: 'Avg Overlap Rate',
        value: formatPercent(snapshot.avg_overlap_rate ?? 0),
        color: '#f59e0b',
      },
      {
        label: 'Avg Outranking Share',
        value: formatPercent(snapshot.avg_outranking_share ?? 0),
        color: '#8b5cf6',
      },
    ],
  }

  const contextual: ContextualInfoData = {
    title: 'Competitive Landscape',
    style: 'info',
    items: [
      {
        label: 'Top competitor',
        text: `${snapshot.top_competitor_id ?? 'Unknown'} (Overlap ${formatPercent(snapshot.top_competitor_overlap_rate ?? 0)})`,
      },
      {
        label: 'Biggest threat',
        text: `${snapshot.biggest_threat_id ?? 'Unknown'} (Outranking ${formatPercent(snapshot.biggest_threat_outranking_you ?? 0)})`,
      },
      {
        label: 'Best opportunity',
        text: `${snapshot.best_opportunity_id ?? 'Unknown'} (You outrank ${formatPercent(snapshot.best_opportunity_you_outranking ?? 0)})`,
      },
    ],
  }

  const metrics: DomainMetricRecord[] = [
    {
      retailerId: snapshot.retailer_id,
      pageType: 'auctions',
      tabName: 'auctions',
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
      pageType: 'auctions',
      tabName: 'auctions',
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
      pageType: 'auctions',
      tabName: 'auctions',
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
