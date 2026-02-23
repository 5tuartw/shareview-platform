import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { parsePeriod, serializeAnalyticsData, validateFilter } from '@/lib/analytics-utils'

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
    const filter = validateFilter(searchParams.get('filter') || 'all')
    const periodParam = searchParams.get('period') || new Date().toISOString().slice(0, 7)

    if (!filter) {
      return NextResponse.json({ error: 'Invalid filter parameter' }, { status: 400 })
    }

    // Convert period to full date format (YYYY-MM -> YYYY-MM-01)
    const periodDate = periodParam.includes('-') ? `${periodParam}-01` : periodParam

    // Set snapshotRetailerId to the slug we already have
    const snapshotRetailerId = retailerId

    // Query current month snapshot for overall metrics and product classifications
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
      return NextResponse.json(
        { error: 'No snapshot data available for this period' },
        { status: 404 }
      )
    }

    // Query previous month snapshot for MoM comparison
    const previousMonthDate = new Date(periodDate)
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1)
    const previousMonthStr = previousMonthDate.toISOString().split('T')[0]

    const previousSnapshotResult = await query(
      `SELECT 
        total_products,
        products_with_conversions,
        products_with_clicks_no_conversions
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

    // Calculate MoM changes
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

    // Extract all classifications from snapshot
    const classifications = {
      top_converters: currentSnapshot.product_classifications?.top_converters || [],
      lowest_converters: currentSnapshot.product_classifications?.lowest_converters || [],
      top_click_through: currentSnapshot.product_classifications?.top_click_through || [],
      high_impressions_no_clicks: currentSnapshot.product_classifications?.high_impressions_no_clicks || [],
    }

    // Filter products based on selected classification
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
        // Combine all classifications for 'all' view, take top 100 by conversions
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

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'products', filter },
    })

    const response = {
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
    }

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

