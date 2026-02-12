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
      return NextResponse.json(
        serializeAnalyticsData({
          summary: null,
          message: 'No coverage data available for the requested date range',
          date_range: { days: dateRange },
        }),
        { status: 404 }
      )
    }

    const snapshot = snapshotResult.rows[0]
    const response = {
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
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'coverage' },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching coverage metrics:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch coverage metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
