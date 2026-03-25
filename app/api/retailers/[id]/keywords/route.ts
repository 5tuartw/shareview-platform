import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { canAccessRetailer } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import {
  getAvailableMonthsWithBounds,
  parsePeriod,
  serializeAnalyticsData,
  validateMetric,
  validateTier,
} from '@/lib/analytics-utils'
import {
  isDemoRetailer,
  sanitiseKeywordMetricCards,
  sanitiseKeywordQuadrants,
  sanitiseKeywordRows,
} from '@/lib/demo-jargon-sanitizer'
import {
  applyKeywordFiltersToRows,
  buildKeywordRowsFromQuadrants,
  buildFilteredKeywordQuadrants,
  fetchKeywordSummaryMetrics,
  fetchRetailerKeywordFilters,
} from '@/services/retailer/keyword-filtering'

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
    const requestedPeriod = searchParams.get('period')

    if (!metric) {
      return NextResponse.json({ error: 'Invalid metric parameter' }, { status: 400 })
    }

    if (!tier) {
      return NextResponse.json({ error: 'Invalid tier parameter' }, { status: 400 })
    }

    await query("SET work_mem = '256MB'")

    let periodParam = requestedPeriod
    if (!periodParam) {
      const latestPeriodResult = await query(
        `SELECT to_char(MAX(range_start), 'YYYY-MM') AS latest_period
         FROM keywords_snapshots
         WHERE retailer_id = $1
           AND range_type = 'month'`,
        [retailerId]
      )
      periodParam = latestPeriodResult.rows[0]?.latest_period || null
    }

    if (!periodParam) {
      return NextResponse.json(
        { error: 'No snapshot data available for this retailer' },
        { status: 404 }
      )
    }

    const availableMonths = await getAvailableMonthsWithBounds(retailerId, 'keywords')

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
      const periods = availableMonths.map((m) => m.period)
      const nearest_before = periods.filter((p) => p < periodParam).slice(-1)[0] ?? null
      const nearest_after = periods.find((p) => p > periodParam) ?? null
      return NextResponse.json(
        { error: 'No snapshot data available for this period', nearest_before, nearest_after },
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
    const retailerKeywordFilters = await fetchRetailerKeywordFilters(retailerId)
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

    const snapshotSummary = {
      unique_search_terms: Number(currentSnapshot.total_keywords || 0),
      total_impressions: Number(currentSnapshot.total_impressions || 0),
      total_clicks: Number(currentSnapshot.total_clicks || 0),
      total_conversions: Number(currentSnapshot.total_conversions || 0),
      overall_ctr: Number(currentSnapshot.overall_ctr || 0),
      overall_cvr: Number(currentSnapshot.overall_cvr || 0),
      tier_star_count: 0,
      tier_strong_count: 0,
      tier_underperforming_count: 0,
      tier_poor_count: 0,
    }

    const filteredCurrentSummary = retailerKeywordFilters.length > 0
      ? await fetchKeywordSummaryMetrics(retailerId, start, end, retailerKeywordFilters)
      : null

    const currentSummary = filteredCurrentSummary && filteredCurrentSummary.unique_search_terms > 0
      ? filteredCurrentSummary
      : snapshotSummary

    const summaryData = {
      unique_search_terms: currentSummary.unique_search_terms,
      total_impressions: currentSummary.total_impressions,
      total_clicks: currentSummary.total_clicks,
      total_conversions: currentSummary.total_conversions,
      overall_ctr: currentSummary.overall_ctr,
      overall_cvr: currentSummary.overall_cvr,
    }

    const filteredQuadrants = await buildFilteredKeywordQuadrants(
      retailerId,
      start,
      end,
      currentSnapshot.top_keywords,
      retailerKeywordFilters
    )

    // Extract top 5 search terms by conversions (winners + hidden_gems both have conversions > 0)
    const allConverting = [
      ...filteredQuadrants.winners,
      ...filteredQuadrants.hidden_gems,
    ].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0))
    const top5Terms = allConverting.slice(0, 5).map((k) => String(k.search_term || ''))
    const topKeywordsText = top5Terms.length > 0
      ? top5Terms.join(', ')
      : 'No high performers yet'

    // Calculate MoM changes
    // For counts: show relative % change
    // For percentages (CTR/CVR): show absolute percentage point difference
    const previousSnapshotSummary = previousSnapshot
      ? {
          unique_search_terms: Number(previousSnapshot.total_keywords || 0),
          total_impressions: 0,
          total_clicks: 0,
          total_conversions: 0,
          overall_ctr: Number(previousSnapshot.overall_ctr || 0),
          overall_cvr: Number(previousSnapshot.overall_cvr || 0),
          tier_star_count: 0,
          tier_strong_count: 0,
          tier_underperforming_count: 0,
          tier_poor_count: 0,
        }
      : null

    const filteredPreviousSummary = previousSnapshot && retailerKeywordFilters.length > 0
      ? await fetchKeywordSummaryMetrics(retailerId, new Date(previousMonthStr), new Date(periodDate), retailerKeywordFilters)
      : null

    const previousSummary = filteredPreviousSummary && filteredPreviousSummary.unique_search_terms > 0
      ? filteredPreviousSummary
      : previousSnapshotSummary

    const totalKeywordsMoM = previousSummary && previousSummary.unique_search_terms > 0
      ? Number((((summaryData.unique_search_terms - previousSummary.unique_search_terms) / previousSummary.unique_search_terms) * 100).toFixed(1))
      : null

    const ctrMoM = previousSummary
      ? Number((summaryData.overall_ctr - previousSummary.overall_ctr).toFixed(2))
      : null

    const cvrMoM = previousSummary
      ? Number((summaryData.overall_cvr - previousSummary.overall_cvr).toFixed(2))
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

    // Extract all quadrants from snapshot (no retailer keyword filtering)
    const quadrants = {
      winners: filteredQuadrants.winners,
      css_wins_retailer_loses: filteredQuadrants.css_wins_retailer_loses,
      hidden_gems: filteredQuadrants.hidden_gems,
      poor_performers: filteredQuadrants.poor_performers,
      median_ctr: filteredQuadrants.median_ctr,
      qualified_count: filteredQuadrants.qualified_count,
      qualification: filteredQuadrants.qualification,
    }

    const filteredKeywordRows = applyKeywordFiltersToRows(keywordsResult.rows, retailerKeywordFilters)
    const fallbackKeywordRows = filteredKeywordRows.length === 0 && retailerKeywordFilters.length > 0
      ? buildKeywordRowsFromQuadrants(filteredQuadrants, metric, tier, limit)
      : []

    const demoRetailer = await isDemoRetailer(retailerId)

    const response = {
      keywords: demoRetailer ? sanitiseKeywordRows(keywordsResult.rows) : (filteredKeywordRows.length > 0 ? filteredKeywordRows : fallbackKeywordRows),
      summary: summaryData,
      metricCards: demoRetailer ? sanitiseKeywordMetricCards(metricCards as Array<Record<string, unknown>>) : metricCards,
      quadrants: demoRetailer ? sanitiseKeywordQuadrants(quadrants as Record<string, unknown>) : quadrants,
      available_months: availableMonths,
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
