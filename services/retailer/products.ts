import { query } from '@/lib/db'
import { serializeAnalyticsData, validateFilter } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

export interface ProductsServiceResult {
  data: unknown
  status: number
}

export async function getRetailerProducts(
  retailerId: string,
  searchParams: URLSearchParams
): Promise<ProductsServiceResult> {
  const filter = validateFilter(searchParams.get('filter') || 'all')
  const periodParam = searchParams.get('period') || new Date().toISOString().slice(0, 7)

  if (!filter) {
    return { data: { error: 'Invalid filter parameter' }, status: 400 }
  }

  const periodDate = periodParam.includes('-') ? `${periodParam}-01` : periodParam
  const snapshotRetailerId = retailerId

  const snapshotStart = Date.now()
  const currentSnapshotResult = await query(
    `SELECT
      total_products,
      total_impressions,
      total_clicks,
      total_conversions,
      avg_ctr,
      avg_cvr,
      products_with_conversions,
      products_with_clicks_no_conversions,
      clicks_without_conversions,
      product_classifications
    FROM product_performance_snapshots
    WHERE retailer_id = $1
      AND range_start::date = $2::date
      AND range_type = 'month'`,
    [snapshotRetailerId, periodDate]
  )
  logSlowQuery('product_performance_snapshots_current', Date.now() - snapshotStart)

  const currentSnapshot = currentSnapshotResult.rows[0]
  if (!currentSnapshot) {
    return { data: { error: 'No snapshot data available for this period' }, status: 404 }
  }

  const previousMonthDate = new Date(periodDate)
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1)
  const previousMonthStr = previousMonthDate.toISOString().split('T')[0]

  const previousSnapshotResult = await query(
    `SELECT total_products, products_with_conversions, products_with_clicks_no_conversions
     FROM product_performance_snapshots
     WHERE retailer_id = $1
       AND range_start::date = $2::date
       AND range_type = 'month'`,
    [snapshotRetailerId, previousMonthStr]
  )
  const previousSnapshot = previousSnapshotResult.rows[0]

  const summaryData = {
    total_products: currentSnapshot.total_products,
    total_impressions: currentSnapshot.total_impressions,
    total_clicks: currentSnapshot.total_clicks,
    total_conversions: currentSnapshot.total_conversions,
    avg_ctr: currentSnapshot.avg_ctr,
    avg_cvr: currentSnapshot.avg_cvr,
    products_with_conversions: currentSnapshot.products_with_conversions,
    products_with_clicks_no_conversions: currentSnapshot.products_with_clicks_no_conversions,
    clicks_without_conversions: currentSnapshot.clicks_without_conversions,
  }

  const totalProductsMoM = previousSnapshot
    ? Number((((currentSnapshot.total_products - previousSnapshot.total_products) / previousSnapshot.total_products) * 100).toFixed(1))
    : null

  const productsWithConversionsMoM = previousSnapshot
    ? Number((((currentSnapshot.products_with_conversions - previousSnapshot.products_with_conversions) / previousSnapshot.products_with_conversions) * 100).toFixed(1))
    : null

  const getMoMStatus = (change: number | null): 'success' | 'warning' | 'critical' | undefined => {
    if (change === null) return undefined
    const threshold = 5
    if (change > threshold) return 'success'
    if (change < -threshold) return 'critical'
    return 'warning'
  }

  const metricCards = [
    {
      label: 'Total Products',
      value: summaryData.total_products || 0,
      subtitle: 'unique products in period',
      ...(totalProductsMoM !== null && {
        change: totalProductsMoM,
        changeUnit: '%' as const,
        status: getMoMStatus(totalProductsMoM),
      }),
    },
    {
      label: 'Products with Conversions',
      value: summaryData.products_with_conversions || 0,
      subtitle: `${summaryData.total_products > 0 ? ((summaryData.products_with_conversions / summaryData.total_products) * 100).toFixed(1) : 0}% of total`,
      ...(productsWithConversionsMoM !== null && {
        change: productsWithConversionsMoM,
        changeUnit: '%' as const,
        status: getMoMStatus(productsWithConversionsMoM),
      }),
    },
    {
      label: 'Products with Clicks but No Conversions',
      value: summaryData.products_with_clicks_no_conversions || 0,
      subtitle: `${summaryData.total_products > 0 ? ((summaryData.products_with_clicks_no_conversions / summaryData.total_products) * 100).toFixed(1) : 0}% of total`,
    },
    {
      label: 'Total Clicks Without Conversions',
      value: summaryData.clicks_without_conversions || 0,
      subtitle: `${summaryData.total_clicks > 0 ? ((summaryData.clicks_without_conversions / summaryData.total_clicks) * 100).toFixed(1) : 0}% of total clicks`,
    },
  ]

  const classifications = {
    top_converters: currentSnapshot.product_classifications?.top_converters || [],
    lowest_converters: currentSnapshot.product_classifications?.lowest_converters || [],
    top_click_through: currentSnapshot.product_classifications?.top_click_through || [],
    high_impressions_no_clicks: currentSnapshot.product_classifications?.high_impressions_no_clicks || [],
  }

  let products: any[] = []
  switch (filter) {
    case 'top_converters':
      products = classifications.top_converters
      break
    case 'lowest_converters':
      products = classifications.lowest_converters
      break
    case 'top_click_through':
      products = classifications.top_click_through
      break
    case 'high_impressions_no_clicks':
      products = classifications.high_impressions_no_clicks
      break
    case 'all':
    default:
      products = [
        ...classifications.top_converters,
        ...classifications.lowest_converters,
        ...classifications.top_click_through,
        ...classifications.high_impressions_no_clicks,
      ]
        .sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0))
        .slice(0, 100)
      break
  }

  return {
    status: 200,
    data: serializeAnalyticsData({
      summary: summaryData,
      products,
      metric_cards: metricCards,
      classifications: {
        top_converters_count: classifications.top_converters.length,
        lowest_converters_count: classifications.lowest_converters.length,
        top_click_through_count: classifications.top_click_through.length,
        high_impressions_no_clicks_count: classifications.high_impressions_no_clicks.length,
      },
      period: periodParam,
    }),
  }
}
