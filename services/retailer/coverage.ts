import { query } from '@/lib/db'
import { serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

export interface CoverageServiceResult {
  data: unknown
  status: number
}

export async function getRetailerCoverage(
  retailerId: string,
  searchParams: URLSearchParams
): Promise<CoverageServiceResult> {
  const dateRange = Number(searchParams.get('date_range') || '30')

  const snapshotStart = Date.now()
  const snapshotResult = await query(
    `SELECT snapshot_date,
            total_products,
            products_with_impressions,
            coverage_rate,
            avg_impressions_per_product,
            zero_visibility,
            low_visibility,
            medium_visibility,
            high_visibility,
            category_breakdown
     FROM coverage_snapshots
     WHERE retailer_id = $1
       AND snapshot_date >= NOW() - ($2::text || ' days')::interval
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [retailerId, dateRange]
  )
  logSlowQuery('coverage_snapshots', Date.now() - snapshotStart)

  if (snapshotResult.rows.length === 0) {
    return {
      status: 404,
      data: serializeAnalyticsData({
        summary: null,
        message: 'No coverage data available for the requested date range',
        date_range: { days: dateRange },
      }),
    }
  }

  const snapshot = snapshotResult.rows[0]
  return {
    status: 200,
    data: serializeAnalyticsData({
      summary: {
        total_products: snapshot.total_products,
        products_with_impressions: snapshot.products_with_impressions,
        coverage_rate: snapshot.coverage_rate,
        avg_impressions_per_product: snapshot.avg_impressions_per_product,
      },
      visibility_distribution: {
        zero_visibility: snapshot.zero_visibility,
        low_visibility: snapshot.low_visibility,
        medium_visibility: snapshot.medium_visibility,
        high_visibility: snapshot.high_visibility,
      },
      category_breakdown: snapshot.category_breakdown || [],
      snapshot_date: snapshot.snapshot_date,
      date_range: { days: dateRange },
    }),
  }
}
