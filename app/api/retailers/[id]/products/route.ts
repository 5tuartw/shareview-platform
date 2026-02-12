import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

const fetchOverviewSnapshot = async (retailerId: string, dateRange: number) => {
  const snapshotStart = Date.now()
  const snapshotResult = await query(
    `SELECT snapshot_date,
            data_period_start,
            data_period_end,
            total_products,
            products_with_conversions,
            total_gmv,
            total_conversions,
            avg_price,
            top_1_pct_gmv_share,
            top_5_pct_gmv_share,
            top_10_pct_gmv_share,
            products_with_wasted_clicks,
            total_wasted_clicks,
            wasted_clicks_percentage
     FROM product_performance_snapshots
     WHERE retailer_id = $1
       AND snapshot_date >= NOW() - ($2::text || ' days')::interval
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [retailerId, dateRange]
  )
  logSlowQuery('product_performance_snapshots_overview', Date.now() - snapshotStart)
  return snapshotResult.rows[0] || null
}

const fetchPerformanceSnapshot = async (retailerId: string, dateRange: number) => {
  const snapshotStart = Date.now()
  const snapshotResult = await query(
    `SELECT snapshot_date,
            top_performers,
            underperformers
     FROM product_performance_snapshots
     WHERE retailer_id = $1
       AND snapshot_date >= NOW() - ($2::text || ' days')::interval
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [retailerId, dateRange]
  )
  logSlowQuery('product_performance_snapshots', Date.now() - snapshotStart)
  return snapshotResult.rows[0] || null
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id: retailerId } = params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dateRange = Number(searchParams.get('date_range') || '30')
    const limit = Number(searchParams.get('limit') || '20')

    const [overviewSnapshot, performanceSnapshot] = await Promise.all([
      fetchOverviewSnapshot(retailerId, dateRange),
      fetchPerformanceSnapshot(retailerId, dateRange),
    ])

    if (!overviewSnapshot && !performanceSnapshot) {
      return NextResponse.json(
        serializeAnalyticsData({
          overview: null,
          top_performers: [],
          underperformers: [],
          message: 'No product snapshot data available for the requested date range',
          date_range: { days: dateRange },
        }),
        { status: 404 }
      )
    }

    const topPerformers = performanceSnapshot?.top_performers
    const underperformers = performanceSnapshot?.underperformers

    const response = {
      overview: overviewSnapshot
        ? {
            total_products: overviewSnapshot.total_products,
            products_with_conversions: overviewSnapshot.products_with_conversions,
            total_gmv: overviewSnapshot.total_gmv,
            total_conversions: overviewSnapshot.total_conversions,
            avg_price: overviewSnapshot.avg_price,
            top_1_pct_gmv_share: overviewSnapshot.top_1_pct_gmv_share,
            top_5_pct_gmv_share: overviewSnapshot.top_5_pct_gmv_share,
            top_10_pct_gmv_share: overviewSnapshot.top_10_pct_gmv_share,
            products_with_wasted_clicks: overviewSnapshot.products_with_wasted_clicks,
            total_wasted_clicks: overviewSnapshot.total_wasted_clicks,
            wasted_clicks_percentage: overviewSnapshot.wasted_clicks_percentage,
          }
        : null,
      top_performers: Array.isArray(topPerformers) ? topPerformers.slice(0, limit) : [],
      underperformers: Array.isArray(underperformers) ? underperformers.slice(0, limit) : [],
      snapshot_date: performanceSnapshot?.snapshot_date || overviewSnapshot?.snapshot_date || null,
      overview_snapshot_date: overviewSnapshot?.snapshot_date || null,
      performance_snapshot_date: performanceSnapshot?.snapshot_date || null,
      data_period: overviewSnapshot
        ? {
            start: overviewSnapshot.data_period_start,
            end: overviewSnapshot.data_period_end,
          }
        : null,
      date_range: { days: dateRange },
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'products' },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch products',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
