import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { parsePeriod, serializeAnalyticsData, validateMetric, validateTier } from '@/lib/analytics-utils'

const logSlowQuery = (label: string, duration: number) => {
  if (duration > 1000) {
    console.warn('Slow query detected', { label, duration })
  }
}

const buildOrderBy = (metric: string) => {
  switch (metric) {
    case 'clicks':
      return 'total_clicks'
    case 'impressions':
      return 'total_impressions'
    case 'conversions':
    default:
      return 'total_conversions'
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
    const metricParam = searchParams.get('metric') || 'conversions'
    const metric = validateMetric(metricParam)
    const tierParam = searchParams.get('tier') || 'all'
    const tier = validateTier(tierParam)
    const limit = Number(searchParams.get('limit') || '20')
    const periodParam = searchParams.get('period') || new Date().toISOString().slice(0, 7)

    if (!metric) {
      return NextResponse.json({ error: 'Invalid metric parameter' }, { status: 400 })
    }

    if (!tier) {
      return NextResponse.json({ error: 'Invalid tier parameter' }, { status: 400 })
    }

    await query("SET work_mem = '256MB'")

    const { start, end } = parsePeriod(periodParam)

    // Convert period to full date format (YYYY-MM -> YYYY-MM-01)
    const periodDate = periodParam.includes('-') ? `${periodParam}-01` : periodParam

    // All IDs are now slug-based; direct reference to snapshot table
    const snapshotRetailerId = retailerId

    // Query current month snapshot for overall metrics and top keywords
    const snapshotStart = Date.now()
    const currentSnapshotResult = await query(
      `SELECT 
        total_keywords,
        total_impressions,
        total_clicks,
        total_conversions,
        overall_ctr,
        overall_cvr,
        top_keywords
      FROM keywords_snapshots
      WHERE retailer_id = $1 
        AND range_start::date = $2::date
        AND range_type = 'month'`,
      [snapshotRetailerId, periodDate]
    )
    logSlowQuery('keywords_snapshots_current', Date.now() - snapshotStart)

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
        total_keywords,
        overall_ctr,
        overall_cvr
      FROM keywords_snapshots
      WHERE retailer_id = $1 
        AND range_start::date = $2::date
        AND range_type = 'month'`,
      [snapshotRetailerId, previousMonthStr]
    )

    const previousSnapshot = previousSnapshotResult.rows[0]

    // Query detailed keywords for table display
    const orderBy = buildOrderBy(metric)
    const paramsList: Array<string | Date | number | string[]> = [retailerId, start, end, limit]
    let tierClause = ''

    if (tier !== 'all') {
      paramsList.splice(3, 0, tier)
      tierClause = 'AND performance_tier = $4'
    }

    const limitParamIndex = tier !== 'all' ? 5 : 4

    // Fetch keyword filters from retailers table and build exclusion clause
    const configFilterResult = await query(
      `SELECT keyword_filters FROM retailers WHERE retailer_id = $1`,
      [retailerId]
    )
    const retailerKeywordFilters: string[] = configFilterResult.rows[0]?.keyword_filters || []
    let keywordExclusionClause = ''
    if (retailerKeywordFilters.length > 0) {
      paramsList.push(retailerKeywordFilters)
      const filterParamIndex = paramsList.length
      keywordExclusionClause = `AND NOT EXISTS (
        SELECT 1 FROM unnest($${filterParamIndex}::text[]) AS f
        WHERE search_term ILIKE '%' || f || '%'
      )`
    }

    const keywordsStart = Date.now()
    const keywordsResult = await query(
      `SELECT search_term,
              total_impressions,
              total_clicks,
              total_conversions,
              ctr,
              conversion_rate,
              performance_tier,
              first_seen,
              last_seen
       FROM mv_keywords_actionable
       WHERE retailer_id = $1
         AND last_seen >= $2
         AND first_seen < $3
         ${tierClause}
         ${keywordExclusionClause}
       ORDER BY ${orderBy} DESC
       LIMIT $${limitParamIndex}`,
      paramsList
    )
    logSlowQuery('mv_keywords_actionable', Date.now() - keywordsStart)

    const summaryData = {
      unique_search_terms: currentSnapshot.total_keywords,
      total_impressions: currentSnapshot.total_impressions,
      total_clicks: currentSnapshot.total_clicks,
      total_conversions: currentSnapshot.total_conversions,
      overall_ctr: currentSnapshot.overall_ctr,
      overall_cvr: currentSnapshot.overall_cvr,
    }

    // Helper: filter a keyword array (each item has a search_term field) against the exclusion list
    const filterKeywordArray = (arr: any[]): any[] => {
      if (!retailerKeywordFilters.length) return arr
      return arr.filter((item: any) => {
        const term = (item.search_term || '').toLowerCase()
        return !retailerKeywordFilters.some((f) => term.includes(f.toLowerCase()))
      })
    }

    // Extract top 5 search terms by conversions (winners + hidden_gems both have conversions > 0)
    const allConverting = [
      ...filterKeywordArray(currentSnapshot.top_keywords?.winners || []),
      ...filterKeywordArray(currentSnapshot.top_keywords?.hidden_gems || []),
    ].sort((a: any, b: any) => Number(b.conversions) - Number(a.conversions))
    const top5Terms = allConverting.slice(0, 5).map((k: any) => k.search_term as string)
    const topKeywordsText = top5Terms.length > 0
      ? top5Terms.join(', ')
      : 'No high performers yet'

    // Calculate MoM changes
    // For counts: show relative % change
    // For percentages (CTR/CVR): show absolute percentage point difference
    const totalKeywordsMoM = previousSnapshot
      ? Number((((currentSnapshot.total_keywords - previousSnapshot.total_keywords) / previousSnapshot.total_keywords) * 100).toFixed(1))
      : null

    const ctrMoM = previousSnapshot
      ? Number((currentSnapshot.overall_ctr - previousSnapshot.overall_ctr).toFixed(2))
      : null

    const cvrMoM = previousSnapshot
      ? Number((currentSnapshot.overall_cvr - previousSnapshot.overall_cvr).toFixed(2))
      : null

    // Determine status based on MoM change
    // For counts: threshold at ±5%
    // For percentages: threshold at ±0.5 percentage points
    const getMoMStatus = (change: number | null, isPercentageMetric = false): 'success' | 'warning' | 'critical' | undefined => {
      if (change === null) return undefined
      const threshold = isPercentageMetric ? 0.5 : 5
      if (change > threshold) return 'success'
      if (change < -threshold) return 'critical'
      return 'warning'
    }

    const metricCards = [
      {
        label: 'Total Search Terms',
        value: summaryData.unique_search_terms || 0,
        subtitle: 'active search terms',
        ...(totalKeywordsMoM !== null && {
          change: totalKeywordsMoM,
          changeUnit: '%' as const,
          status: getMoMStatus(totalKeywordsMoM),
        }),
      },
      {
        label: 'Top Search Terms by Conversions',
        value: topKeywordsText,
      },
      {
        label: 'Conversion Rate',
        value: `${Number(summaryData.overall_cvr || 0).toFixed(1)}%`,
        subtitle: 'overall CVR',
        ...(cvrMoM !== null && {
          change: cvrMoM,
          changeUnit: 'pp' as const,
          status: getMoMStatus(cvrMoM, true),
        }),
      },
      {
        label: 'Click-through Rate',
        value: `${Number(summaryData.overall_ctr || 0).toFixed(1)}%`,
        subtitle: 'overall CTR',
        ...(ctrMoM !== null && {
          change: ctrMoM,
          changeUnit: 'pp' as const,
          status: getMoMStatus(ctrMoM, true),
        }),
      },
    ]

    // Extract all quadrants from snapshot, filtering out excluded terms
    const quadrants = {
      winners: filterKeywordArray(currentSnapshot.top_keywords?.winners || []),
      css_wins_retailer_loses: filterKeywordArray(currentSnapshot.top_keywords?.css_wins_retailer_loses || []),
      hidden_gems: filterKeywordArray(currentSnapshot.top_keywords?.hidden_gems || []),
      poor_performers: filterKeywordArray(currentSnapshot.top_keywords?.poor_performers || []),
      median_ctr: currentSnapshot.top_keywords?.median_ctr || 0,
    }

    const response = {
      keywords: keywordsResult.rows,
      summary: summaryData,
      metricCards,
      quadrants,
    }

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { endpoint: 'keywords', period: periodParam, tier },
    })

    return NextResponse.json(serializeAnalyticsData(response))
  } catch (error) {
    console.error('Error fetching keyword performance:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch keyword performance',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
