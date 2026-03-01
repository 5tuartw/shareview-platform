import { query } from '@/lib/db'
import { parsePeriodParam, serializeAnalyticsData } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

const buildHealthSummary = (categories: Array<{ health_status?: string | null }>) => {
  const summary = {
    poor: { count: 0, top_categories: [] as string[] },
    underperforming: { count: 0, top_categories: [] as string[] },
    strong: { count: 0, top_categories: [] as string[] },
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

export interface CategoriesServiceResult {
  data: unknown
  status: number
}

export async function getRetailerCategories(
  retailerId: string,
  searchParams: URLSearchParams
): Promise<CategoriesServiceResult> {
  const periodParam = searchParams.get('period') || searchParams.get('date_range') || new Date().toISOString().slice(0, 7)
  const depthParam = searchParams.get('depth')
  const parentPath = searchParams.get('parent_path')
  const fullPathParam = searchParams.get('full_path')
  const useNodeMetrics = searchParams.get('node_only') === 'true'

  const snapshotRetailerId = retailerId
  const { periodStart, periodEnd } = parsePeriodParam(periodParam)

  let whereClause = 'retailer_id = $1 AND range_start = $2 AND range_end = $3'
  const queryParams: unknown[] = [snapshotRetailerId, periodStart, periodEnd]

  if (fullPathParam) {
    whereClause += ' AND full_path = $4'
    queryParams.push(fullPathParam)
  } else if (parentPath) {
    whereClause += ' AND parent_path = $4'
    queryParams.push(parentPath)
  } else if (depthParam) {
    whereClause += ' AND depth = $4'
    queryParams.push(Number(depthParam))
  } else {
    const rootCheckResult = await query(
      `SELECT COUNT(*) as root_count,
              bool_or(has_children) as any_has_children
       FROM category_performance_snapshots
       WHERE retailer_id = $1
         AND range_start = $2
         AND range_end = $3
         AND depth = 1`,
      [snapshotRetailerId, periodStart, periodEnd]
    )
    const rootCheck = rootCheckResult.rows[0]
    if (rootCheck && Number(rootCheck.root_count) === 1 && rootCheck.any_has_children) {
      const singleRootResult = await query(
        `SELECT full_path
         FROM category_performance_snapshots
         WHERE retailer_id = $1
           AND range_start = $2
           AND range_end = $3
           AND depth = 1
         LIMIT 1`,
        [snapshotRetailerId, periodStart, periodEnd]
      )
      if (singleRootResult.rows.length > 0) {
        whereClause += ' AND parent_path = $4'
        queryParams.push(singleRootResult.rows[0].full_path)
      } else {
        whereClause += ' AND depth = 1'
      }
    } else {
      whereClause += ' AND depth = 1'
    }
  }

  const snapshotStart = Date.now()
  const categoriesResult = await query(
    `SELECT
       full_path,
       category_level1, category_level2, category_level3, category_level4, category_level5,
       depth, parent_path,
       node_impressions, node_clicks, node_conversions, node_ctr, node_cvr,
       branch_impressions, branch_clicks, branch_conversions, branch_ctr, branch_cvr,
       has_children, child_count,
       health_status_node, health_status_branch
     FROM category_performance_snapshots
     WHERE ${whereClause}
     ORDER BY ${useNodeMetrics ? 'node_impressions' : 'branch_impressions'} DESC`,
    queryParams
  )
  logSlowQuery('category_performance_snapshots', Date.now() - snapshotStart)

  const categories = categoriesResult.rows.map((row) => {
    const impressions = useNodeMetrics ? Number(row.node_impressions) : Number(row.branch_impressions)
    const clicks = useNodeMetrics ? Number(row.node_clicks) : Number(row.branch_clicks)
    const conversions = useNodeMetrics ? Number(row.node_conversions) : Number(row.branch_conversions)
    const ctr = useNodeMetrics ? row.node_ctr : row.branch_ctr
    const cvr = useNodeMetrics ? row.node_cvr : row.branch_cvr
    return {
      category: row.full_path,
      full_path: row.full_path,
      category_level1: row.category_level1,
      category_level2: row.category_level2,
      category_level3: row.category_level3,
      category_level4: row.category_level4,
      category_level5: row.category_level5,
      depth: row.depth,
      parent_path: row.parent_path,
      impressions,
      clicks,
      conversions,
      ctr: ctr ? Number(ctr) : 0,
      cvr: cvr ? Number(cvr) : 0,
      has_children: row.has_children,
      child_count: row.child_count,
      health_status: useNodeMetrics ? (row.health_status_node || null) : (row.health_status_branch || null),
      node_metrics: {
        impressions: Number(row.node_impressions),
        clicks: Number(row.node_clicks),
        conversions: Number(row.node_conversions),
        ctr: row.node_ctr ? Number(row.node_ctr) : 0,
        cvr: row.node_cvr ? Number(row.node_cvr) : 0,
      },
      branch_metrics: {
        impressions: Number(row.branch_impressions),
        clicks: Number(row.branch_clicks),
        conversions: Number(row.branch_conversions),
        ctr: row.branch_ctr ? Number(row.branch_ctr) : 0,
        cvr: row.branch_cvr ? Number(row.branch_cvr) : 0,
      },
    }
  })

  const totalImpressions = categories.reduce((sum, cat) => sum + cat.impressions, 0)
  const totalClicks = categories.reduce((sum, cat) => sum + cat.clicks, 0)
  const totalConversions = categories.reduce((sum, cat) => sum + cat.conversions, 0)

  return {
    status: 200,
    data: serializeAnalyticsData({
      categories,
      summary: {
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        overall_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        overall_cvr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        category_count: categories.length,
      },
      health_summary: buildHealthSummary(categories),
      date_range: { start: periodStart, end: periodEnd },
      navigation: {
        current_parent: parentPath || null,
        current_depth: categories.length > 0 ? categories[0].depth : 1,
        showing_node_only: useNodeMetrics,
      },
      from_snapshot: true,
      source: 'snapshot',
    }),
  }
}
