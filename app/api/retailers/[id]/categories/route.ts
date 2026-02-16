import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { buildDateRange, serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

const buildHealthSummary = (categories: Array<{ health_status?: string | null }>) => {
  const summary = {
    broken: { count: 0, top_categories: [] as string[] },
    underperforming: { count: 0, top_categories: [] as string[] },
    attention: { count: 0, top_categories: [] as string[] },
    healthy: { count: 0, top_categories: [] as string[] },
    star: { count: 0, top_categories: [] as string[] },
    none: { count: 0, top_categories: [] as string[] },
  }

  categories.forEach((category) => {
    const status = category.health_status || 'none'
    if (status in summary) {
      summary[status as keyof typeof summary].count += 1
    } else {
      summary.none.count += 1
    }
  })

  return summary
}

type CategoryRow = Record<string, unknown> & {
  impressions: number | string | null
  clicks: number | string | null
  conversions: number | string | null
  health_status?: string | null
}

type CategoryWithPercentage = CategoryRow & {
  percentage: number
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
    const dateRangeDays = Number(searchParams.get('date_range') || '30')
    const levelParam = searchParams.get('level') || '3'
    const level = ['1', '2', '3'].includes(levelParam) ? levelParam : '3'

    const snapshotStart = Date.now()
    const snapshotResult = await query(
      `SELECT snapshot_date,
              categories,
              health_summary,
              summary,
              date_range,
              source
       FROM category_performance_snapshots
       WHERE retailer_id = $1
         AND level = $2
         AND snapshot_date >= NOW() - INTERVAL '14 days'
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [retailerId, level]
    )
    logSlowQuery('category_performance_snapshots', Date.now() - snapshotStart)

    if (snapshotResult.rows.length > 0) {
      const snapshot = snapshotResult.rows[0]
      const response = {
        categories: snapshot.categories || [],
        summary: snapshot.summary || {},
        health_summary: snapshot.health_summary || {},
        date_range: snapshot.date_range || null,
        from_snapshot: true,
        source: snapshot.source || 'snapshot',
        snapshot_date: snapshot.snapshot_date,
      }

      await logActivity({
        userId: Number(session.user.id),
        action: 'retailer_viewed',
        retailerId,
        entityType: 'retailer',
        entityId: retailerId,
        details: { endpoint: 'categories', source: 'snapshot' },
      })

      return NextResponse.json(serializeAnalyticsData(response))
    }

    const { start, end } = buildDateRange(dateRangeDays)

    const categorySelect =
      level === '1'
        ? `category_level1 AS category,
              category_level1,
              NULL::text AS category_level2,
              NULL::text AS category_level3`
        : level === '2'
          ? `COALESCE(category_level2, category_level1) AS category,
              category_level1,
              category_level2,
              NULL::text AS category_level3`
          : `category,
              category_level1,
              category_level2,
              category_level3`

    const groupByClause =
      level === '1'
        ? 'category_level1'
        : level === '2'
          ? 'category_level1, category_level2'
          : 'category, category_level1, category_level2, category_level3'

    const dataStart = Date.now()
    const dataResult = await query(
      `SELECT ${categorySelect},
              COALESCE(SUM(impressions), 0) AS impressions,
              COALESCE(SUM(clicks), 0) AS clicks,
              COALESCE(SUM(conversions), 0) AS conversions,
              CASE WHEN SUM(impressions) > 0
                THEN (SUM(clicks)::numeric / SUM(impressions)::numeric) * 100
                ELSE 0 END AS ctr,
              CASE WHEN SUM(clicks) > 0
                THEN (SUM(conversions)::numeric / SUM(clicks)::numeric) * 100
                ELSE 0 END AS cvr,
              MAX(health_status) AS health_status,
              MAX(health_reason) AS health_reason
       FROM category_performance
       WHERE retailer_id = $1
         AND insight_date >= $2
         AND insight_date <= $3
       GROUP BY ${groupByClause}`,
      [retailerId, start, end]
    )
    logSlowQuery('category_performance', Date.now() - dataStart)

    const categories = dataResult.rows.filter(
      (row): row is CategoryRow => Number((row as CategoryRow).impressions) > 0
    )

    const totalImpressions = categories.reduce((sum, row) => sum + Number(row.impressions || 0), 0)
    const totalClicks = categories.reduce((sum, row) => sum + Number(row.clicks || 0), 0)
    const totalConversions = categories.reduce((sum, row) => sum + Number(row.conversions || 0), 0)

    const categoriesWithPercentages: CategoryWithPercentage[] = categories.map((row) => ({
      ...row,
      percentage: totalImpressions > 0 ? (Number(row.impressions) / totalImpressions) * 100 : 0,
    }))

    const response = {
      categories: categoriesWithPercentages,
      summary: {
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        overall_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        overall_cvr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        category_count: categoriesWithPercentages.length,
      },
      health_summary: buildHealthSummary(categoriesWithPercentages),
      date_range: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        days: dateRangeDays,
      },
      from_snapshot: false,
      source: 'live',
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'categories', source: 'live' },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching category performance:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch category performance',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
