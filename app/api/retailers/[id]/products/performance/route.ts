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

const normaliseFilters = (filters: unknown): string[] => {
  if (!Array.isArray(filters)) return []
  return filters
    .map((filter) => (typeof filter === 'string' ? filter.trim().toLowerCase() : ''))
    .filter((filter) => filter.length > 0)
}

const isExcludedProduct = (product: any, filters: string[]): boolean => {
  if (filters.length === 0) return false
  const title = String(product?.product_title || product?.title || '').toLowerCase()
  if (!title) return false
  return filters.some((filter) => title.includes(filter))
}

const applyProductExclusions = (products: any[], filters: string[]): any[] => {
  if (filters.length === 0) return products
  return products.filter((product) => !isExcludedProduct(product, filters))
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
    const limit = Number(searchParams.get('limit') || '20')
    const dateRange = Number(searchParams.get('date_range') || '30')

    const productFilterResult = await query(
      `SELECT product_filters FROM retailers WHERE retailer_id = $1`,
      [retailerId]
    )
    const productFilters = normaliseFilters(productFilterResult.rows[0]?.product_filters)

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

    if (snapshotResult.rows.length === 0) {
      return NextResponse.json(
        serializeAnalyticsData({
          top_performers: [],
          underperformers: [],
          message: 'No product performance snapshot data available for the requested date range',
          date_range: { days: dateRange },
        }),
        { status: 404 }
      )
    }

    const snapshot = snapshotResult.rows[0]
    const topPerformers = Array.isArray(snapshot.top_performers)
      ? applyProductExclusions(snapshot.top_performers, productFilters).slice(0, limit)
      : []
    const underperformers = Array.isArray(snapshot.underperformers)
      ? applyProductExclusions(snapshot.underperformers, productFilters).slice(0, limit)
      : []

    const response = {
      top_performers: topPerformers,
      underperformers,
      snapshot_date: snapshot.snapshot_date,
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'products-performance' },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching products performance:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch products performance',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
