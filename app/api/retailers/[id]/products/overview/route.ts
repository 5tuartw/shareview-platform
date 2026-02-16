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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Unauthorized: No access to this retailer' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dateRange = Number(searchParams.get('date_range') || '30')

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

    if (snapshotResult.rows.length === 0) {
      return NextResponse.json(
        serializeAnalyticsData({
          overview: null,
          message: 'No product snapshot data available for the requested date range',
          date_range: { days: dateRange },
        }),
        { status: 404 }
      )
    }

    const snapshot = snapshotResult.rows[0]
    const response = {
      overview: {
        total_products: snapshot.total_products,
        products_with_conversions: snapshot.products_with_conversions,
        total_gmv: snapshot.total_gmv,
        total_conversions: snapshot.total_conversions,
        avg_price: snapshot.avg_price,
        top_1_pct_gmv_share: snapshot.top_1_pct_gmv_share,
        top_5_pct_gmv_share: snapshot.top_5_pct_gmv_share,
        top_10_pct_gmv_share: snapshot.top_10_pct_gmv_share,
        products_with_wasted_clicks: snapshot.products_with_wasted_clicks,
        total_wasted_clicks: snapshot.total_wasted_clicks,
        wasted_clicks_percentage: snapshot.wasted_clicks_percentage,
      },
      snapshot_date: snapshot.snapshot_date,
      data_period: {
        start: snapshot.data_period_start,
        end: snapshot.data_period_end,
      },
      date_range: { days: dateRange },
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'products-overview' },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching products overview:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch products overview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
