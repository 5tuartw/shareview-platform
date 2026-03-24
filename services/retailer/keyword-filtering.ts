import { getAnalyticsNetworkId, query, queryAnalytics } from '@/lib/db'

const DEFAULT_KEYWORD_LIMITS = {
  winners: 150,
  css_wins_retailer_loses: 100,
  hidden_gems: 150,
  poor_performers: 100,
} as const

type KeywordLike = {
  search_term?: string | null
}

type KeywordQualification = {
  min_impressions?: number
  min_clicks?: number
  fallback_applied?: boolean
  fallback_reason?: 'qualified_count' | 'positive_count' | 'both' | null
  base_min_impressions?: number
  base_min_clicks?: number
  fallback_min_impressions?: number
  fallback_min_clicks?: number
  trigger_qualified_count?: number
  trigger_positive_count?: number
  positive_count?: number
}

type KeywordSnapshotTopKeywords = {
  winners?: Array<Record<string, unknown>>
  css_wins_retailer_loses?: Array<Record<string, unknown>>
  hidden_gems?: Array<Record<string, unknown>>
  poor_performers?: Array<Record<string, unknown>>
  median_ctr?: number
  qualified_count?: number
  qualification?: KeywordQualification | null
}

export interface KeywordSummaryMetrics {
  unique_search_terms: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  overall_ctr: number
  overall_cvr: number
  tier_star_count: number
  tier_strong_count: number
  tier_underperforming_count: number
  tier_poor_count: number
}

export interface FilteredKeywordQuadrants {
  winners: Array<Record<string, unknown>>
  css_wins_retailer_loses: Array<Record<string, unknown>>
  hidden_gems: Array<Record<string, unknown>>
  poor_performers: Array<Record<string, unknown>>
  median_ctr: number
  qualified_count: number
  qualification: KeywordQualification | null
}

export interface FilteredWordAnalysisRow {
  word: string
  total_occurrences: number
  keyword_count: number
  keywords_with_clicks: number
  keywords_with_conversions: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  avg_ctr: number | null
  avg_cvr: number | null
  click_to_conversion_pct: number | null
  word_category: string | null
  performance_tier: string
}

export interface FilteredWordAnalysisSummary {
  total_words: number
  star_words: number
  good_words: number
  dead_words: number
  poor_words: number
  average_words: number
  total_impressions: number
  total_conversions: number
  total_clicks: number
  wasted_clicks: number
  analysis_date: Date | null
}

const toNumber = (value: number | string | null | undefined): number => {
  if (value == null) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const normaliseKeywordFilters = (filters: string[] | null | undefined): string[] => {
  return (filters || []).map((filter) => filter.trim()).filter(Boolean)
}

export const fetchRetailerKeywordFilters = async (retailerId: string): Promise<string[]> => {
  const result = await query<{ keyword_filters: string[] | null }>(
    `SELECT keyword_filters FROM retailers WHERE retailer_id = $1`,
    [retailerId]
  )

  return normaliseKeywordFilters(result.rows[0]?.keyword_filters)
}

export const applyKeywordFiltersToRows = <T extends KeywordLike>(rows: T[], keywordFilters: string[]): T[] => {
  const filters = normaliseKeywordFilters(keywordFilters)
  if (filters.length === 0) return rows

  return rows.filter((row) => {
    const term = (row.search_term || '').toLowerCase()
    return !filters.some((filter) => term.includes(filter.toLowerCase()))
  })
}

const buildSearchTermExclusionClause = (
  columnName: string,
  keywordFilters: string[],
  params: Array<string | number | Date | string[]>
): string => {
  const filters = normaliseKeywordFilters(keywordFilters)
  if (filters.length === 0) return ''

  params.push(filters)
  return `
    AND NOT EXISTS (
      SELECT 1 FROM unnest($${params.length}::text[]) AS f
      WHERE ${columnName} ILIKE '%' || f || '%'
    )`
}

export const fetchKeywordSummaryMetrics = async (
  retailerId: string,
  periodStart: Date,
  periodEnd: Date,
  keywordFilters: string[]
): Promise<KeywordSummaryMetrics> => {
  const params: Array<string | number | Date | string[]> = [retailerId, periodStart, periodEnd]
  const exclusionClause = buildSearchTermExclusionClause('search_term', keywordFilters, params)

  const result = await query<{
    total_keywords: number | string | null
    total_impressions: number | string | null
    total_clicks: number | string | null
    total_conversions: number | string | null
    overall_ctr: number | string | null
    overall_cvr: number | string | null
    tier_star_count: number | string | null
    tier_strong_count: number | string | null
    tier_underperforming_count: number | string | null
    tier_poor_count: number | string | null
  }>(
    `
    SELECT
      COUNT(*) AS total_keywords,
      COALESCE(SUM(total_impressions), 0) AS total_impressions,
      COALESCE(SUM(total_clicks), 0) AS total_clicks,
      COALESCE(SUM(total_conversions), 0) AS total_conversions,
      CASE WHEN SUM(total_impressions) > 0
        THEN (SUM(total_clicks)::numeric / SUM(total_impressions)::numeric) * 100
        ELSE 0
      END AS overall_ctr,
      CASE WHEN SUM(total_clicks) > 0
        THEN (SUM(total_conversions)::numeric / SUM(total_clicks)::numeric) * 100
        ELSE 0
      END AS overall_cvr,
      COUNT(*) FILTER (WHERE performance_tier = 'star') AS tier_star_count,
      COUNT(*) FILTER (WHERE performance_tier = 'strong') AS tier_strong_count,
      COUNT(*) FILTER (WHERE performance_tier = 'underperforming') AS tier_underperforming_count,
      COUNT(*) FILTER (WHERE performance_tier = 'poor') AS tier_poor_count
    FROM mv_keywords_actionable
    WHERE retailer_id = $1
      AND last_seen >= $2
      AND first_seen < $3
      ${exclusionClause}
    `,
    params
  )

  const row = result.rows[0]

  return {
    unique_search_terms: toNumber(row?.total_keywords),
    total_impressions: toNumber(row?.total_impressions),
    total_clicks: toNumber(row?.total_clicks),
    total_conversions: toNumber(row?.total_conversions),
    overall_ctr: toNumber(row?.overall_ctr),
    overall_cvr: toNumber(row?.overall_cvr),
    tier_star_count: toNumber(row?.tier_star_count),
    tier_strong_count: toNumber(row?.tier_strong_count),
    tier_underperforming_count: toNumber(row?.tier_underperforming_count),
    tier_poor_count: toNumber(row?.tier_poor_count),
  }
}

export const buildFilteredKeywordQuadrants = async (
  retailerId: string,
  periodStart: Date,
  periodEnd: Date,
  topKeywords: KeywordSnapshotTopKeywords | null | undefined,
  keywordFilters: string[]
): Promise<FilteredKeywordQuadrants> => {
  const filters = normaliseKeywordFilters(keywordFilters)
  const qualification = topKeywords?.qualification || null

  if (filters.length === 0) {
    return {
      winners: topKeywords?.winners || [],
      css_wins_retailer_loses: topKeywords?.css_wins_retailer_loses || [],
      hidden_gems: topKeywords?.hidden_gems || [],
      poor_performers: topKeywords?.poor_performers || [],
      median_ctr: toNumber(topKeywords?.median_ctr),
      qualified_count: toNumber(topKeywords?.qualified_count),
      qualification,
    }
  }

  const minImpressions = qualification?.min_impressions ?? 50
  const minClicks = qualification?.min_clicks ?? 5
  const limits = {
    winners: Math.max(topKeywords?.winners?.length || 0, DEFAULT_KEYWORD_LIMITS.winners),
    css_wins_retailer_loses: Math.max(
      topKeywords?.css_wins_retailer_loses?.length || 0,
      DEFAULT_KEYWORD_LIMITS.css_wins_retailer_loses
    ),
    hidden_gems: Math.max(topKeywords?.hidden_gems?.length || 0, DEFAULT_KEYWORD_LIMITS.hidden_gems),
    poor_performers: Math.max(topKeywords?.poor_performers?.length || 0, DEFAULT_KEYWORD_LIMITS.poor_performers),
  }

  const params: Array<string | number | Date | string[]> = [
    retailerId,
    periodStart,
    periodEnd,
    minImpressions,
    minClicks,
  ]
  const exclusionClause = buildSearchTermExclusionClause('search_term', filters, params)

  params.push(limits.winners, limits.css_wins_retailer_loses, limits.hidden_gems, limits.poor_performers)

  const result = await query<{
    median_ctr: number | string | null
    qualified_count: number | string | null
    positive_count: number | string | null
    winners: Array<Record<string, unknown>> | null
    css_wins_retailer_loses: Array<Record<string, unknown>> | null
    hidden_gems: Array<Record<string, unknown>> | null
    poor_performers: Array<Record<string, unknown>> | null
  }>(
    `
    WITH qualified AS (
      SELECT
        search_term,
        total_impressions AS impressions,
        total_clicks AS clicks,
        total_conversions AS conversions,
        ctr,
        conversion_rate AS cvr
      FROM mv_keywords_actionable
      WHERE retailer_id = $1
        AND last_seen >= $2
        AND first_seen < $3
        AND total_impressions >= $4
        AND total_clicks >= $5
        ${exclusionClause}
    ),
    qualification AS (
      SELECT
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ctr), 0) AS median_ctr,
        COUNT(*)::int AS qualified_count,
        COUNT(*) FILTER (WHERE conversions > 0)::int AS positive_count
      FROM qualified
    ),
    winners AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', impressions,
        'clicks', clicks,
        'conversions', ROUND(conversions::numeric, 2),
        'ctr', ROUND(ctr::numeric, 2),
        'cvr', ROUND(cvr::numeric, 2)
      ) AS keyword_data
      FROM qualified, qualification
      WHERE ctr >= qualification.median_ctr AND conversions > 0
      ORDER BY conversions DESC, clicks DESC, search_term ASC
      LIMIT $${params.length - 3}
    ),
    css_wins_retailer_loses AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', impressions,
        'clicks', clicks,
        'conversions', ROUND(conversions::numeric, 2),
        'ctr', ROUND(ctr::numeric, 2),
        'cvr', ROUND(cvr::numeric, 2)
      ) AS keyword_data
      FROM qualified, qualification
      WHERE ctr >= qualification.median_ctr AND conversions = 0
      ORDER BY clicks DESC, impressions DESC, search_term ASC
      LIMIT $${params.length - 2}
    ),
    hidden_gems AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', impressions,
        'clicks', clicks,
        'conversions', ROUND(conversions::numeric, 2),
        'ctr', ROUND(ctr::numeric, 2),
        'cvr', ROUND(cvr::numeric, 2)
      ) AS keyword_data
      FROM qualified, qualification
      WHERE ctr < qualification.median_ctr AND conversions > 0
      ORDER BY conversions DESC, clicks DESC, search_term ASC
      LIMIT $${params.length - 1}
    ),
    poor_performers AS (
      SELECT json_build_object(
        'search_term', search_term,
        'impressions', impressions,
        'clicks', clicks,
        'conversions', ROUND(conversions::numeric, 2),
        'ctr', ROUND(ctr::numeric, 2),
        'cvr', ROUND(cvr::numeric, 2)
      ) AS keyword_data
      FROM qualified, qualification
      WHERE ctr < qualification.median_ctr AND conversions = 0
      ORDER BY clicks DESC, impressions DESC, search_term ASC
      LIMIT $${params.length}
    )
    SELECT
      qualification.median_ctr,
      qualification.qualified_count,
      qualification.positive_count,
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM winners) AS winners,
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM css_wins_retailer_loses) AS css_wins_retailer_loses,
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM hidden_gems) AS hidden_gems,
      (SELECT COALESCE(json_agg(keyword_data), '[]'::json) FROM poor_performers) AS poor_performers
    FROM qualification
    `,
    params
  )

  const row = result.rows[0]

  return {
    winners: row?.winners || [],
    css_wins_retailer_loses: row?.css_wins_retailer_loses || [],
    hidden_gems: row?.hidden_gems || [],
    poor_performers: row?.poor_performers || [],
    median_ctr: toNumber(row?.median_ctr),
    qualified_count: toNumber(row?.qualified_count),
    qualification: qualification
      ? {
          ...qualification,
          positive_count: toNumber(row?.positive_count),
        }
      : null,
  }
}

const buildWordAnalysisTierClause = (tier: string | null, params: Array<string | number | Date | string[]>): string => {
  if (!tier || tier === 'all') return ''

  params.push(tier)
  return `AND performance_tier = $${params.length}`
}

const buildRawWordAnalysisBaseQuery = (
  sourceRetailerId: string,
  rangeStart: string,
  rangeEnd: string,
  minFrequency: number,
  keywordFilters: string[]
): { sql: string; params: Array<string | number | string[]> } => {
  const params: Array<string | number | string[]> = [sourceRetailerId, rangeStart, rangeEnd, minFrequency]
  const exclusionClause = buildSearchTermExclusionClause('search_term', keywordFilters, params)

  return {
    sql: `
      WITH filtered_keywords AS (
        SELECT
          insight_date,
          search_term,
          impressions,
          clicks,
          conversions
        FROM keywords
        WHERE retailer_id = $1
          AND insight_date BETWEEN $2::date AND $3::date
          ${exclusionClause}
      ),
      tokenized AS (
        SELECT
          MAX(insight_date) OVER ()::date AS source_analysis_date,
          search_term,
          impressions,
          clicks,
          conversions,
          regexp_split_to_table(
            lower(regexp_replace(search_term, '[^a-zA-Z0-9]+', ' ', 'g')),
            '[[:space:]]+'
          ) AS word
        FROM filtered_keywords
      ),
      aggregated AS (
        SELECT
          MAX(source_analysis_date) AS source_analysis_date,
          word,
          COUNT(DISTINCT search_term)::int AS keyword_count,
          COUNT(*)::int AS total_occurrences,
          COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END)::int AS keywords_with_clicks,
          COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END)::int AS keywords_with_conversions,
          COALESCE(SUM(impressions), 0)::bigint AS total_impressions,
          COALESCE(SUM(clicks), 0)::bigint AS total_clicks,
          COALESCE(SUM(conversions), 0)::numeric(10,2) AS total_conversions,
          ROUND(
            (COALESCE(SUM(clicks), 0)::numeric / NULLIF(COALESCE(SUM(impressions), 0)::numeric, 0)) * 100,
            4
          ) AS avg_ctr,
          ROUND(
            (COALESCE(SUM(conversions), 0)::numeric / NULLIF(COALESCE(SUM(clicks), 0)::numeric, 0)) * 100,
            4
          ) AS avg_cvr,
          ROUND(
            (
              COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END)::numeric /
              NULLIF(COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END), 0)
            ) * 100,
            4
          ) AS click_to_conversion_pct,
          NULL::varchar AS word_category,
          CASE
            WHEN COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END) >= 5
              AND COALESCE(
                ROUND(
                  (
                    COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END)::numeric /
                    NULLIF(COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END), 0)
                  ) * 100,
                  4
                ),
                0
              ) >= 10 THEN 'star'
            WHEN COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END) >= 2
              AND COALESCE(
                ROUND(
                  (
                    COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END)::numeric /
                    NULLIF(COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END), 0)
                  ) * 100,
                  4
                ),
                0
              ) >= 5 THEN 'good'
            WHEN COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END) >= 5
              AND COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END) = 0 THEN 'dead'
            WHEN COUNT(DISTINCT CASE WHEN clicks > 0 THEN search_term END) >= 3
              AND COUNT(DISTINCT CASE WHEN conversions > 0 THEN search_term END) = 0 THEN 'poor'
            ELSE 'average'
          END AS performance_tier
        FROM tokenized
        WHERE length(trim(word)) > 2
          AND word NOT IN ('a', 'an', 'the')
        GROUP BY word
        HAVING COUNT(DISTINCT search_term) >= $4
      )
    `,
    params,
  }
}

export const fetchFilteredWordAnalysis = async (
  retailerId: string,
  rangeStart: string,
  rangeEnd: string,
  minFrequency: number,
  sortBy: string,
  limit: number,
  tier: string,
  keywordFilters: string[]
): Promise<{ words: FilteredWordAnalysisRow[]; summary: FilteredWordAnalysisSummary } | null> => {
  const filters = normaliseKeywordFilters(keywordFilters)
  if (filters.length === 0) return null

  const sourceRetailerId = await getAnalyticsNetworkId(retailerId, 'keywords')
  if (!sourceRetailerId) return null

  const { sql: baseSql, params: baseParams } = buildRawWordAnalysisBaseQuery(
    sourceRetailerId,
    rangeStart,
    rangeEnd,
    minFrequency,
    filters
  )

  const orderBy = (() => {
    switch (sortBy) {
      case 'clicks':
        return 'total_clicks'
      case 'efficiency':
        return 'click_to_conversion_pct'
      case 'impressions':
        return 'total_impressions'
      case 'conversions':
      default:
        return 'total_conversions'
    }
  })()

  const wordParams = [...baseParams]
  const tierClause = buildWordAnalysisTierClause(tier, wordParams)
  wordParams.push(limit)

  const wordsResult = await queryAnalytics<FilteredWordAnalysisRow>(
    `
    ${baseSql}
    SELECT
      word,
      total_occurrences,
      keyword_count,
      keywords_with_clicks,
      keywords_with_conversions,
      total_impressions,
      total_clicks,
      total_conversions,
      avg_ctr,
      avg_cvr,
      click_to_conversion_pct,
      word_category,
      performance_tier
    FROM aggregated
    WHERE 1 = 1
      ${tierClause}
    ORDER BY ${orderBy} DESC, total_clicks DESC, word ASC
    LIMIT $${wordParams.length}
    `,
    wordParams
  )

  const summaryParams = [...baseParams]
  const summaryResult = await queryAnalytics<FilteredWordAnalysisSummary>(
    `
    ${baseSql}
    SELECT
      COUNT(*)::int AS total_words,
      SUM(CASE WHEN performance_tier = 'star' THEN 1 ELSE 0 END)::int AS star_words,
      SUM(CASE WHEN performance_tier = 'good' THEN 1 ELSE 0 END)::int AS good_words,
      SUM(CASE WHEN performance_tier = 'dead' THEN 1 ELSE 0 END)::int AS dead_words,
      SUM(CASE WHEN performance_tier = 'poor' THEN 1 ELSE 0 END)::int AS poor_words,
      SUM(CASE WHEN performance_tier = 'average' THEN 1 ELSE 0 END)::int AS average_words,
      COALESCE(SUM(total_impressions), 0)::bigint AS total_impressions,
      COALESCE(SUM(total_conversions), 0)::numeric(10,2) AS total_conversions,
      COALESCE(SUM(total_clicks), 0)::bigint AS total_clicks,
      COALESCE(SUM(CASE WHEN performance_tier = 'dead' THEN total_clicks ELSE 0 END), 0)::bigint AS wasted_clicks,
      MAX(source_analysis_date) AS analysis_date
    FROM aggregated
    `,
    summaryParams
  )

  const summaryRow = summaryResult.rows[0]

  return {
    words: wordsResult.rows.map((row) => ({
      ...row,
      total_occurrences: toNumber(row.total_occurrences),
      keyword_count: toNumber(row.keyword_count),
      keywords_with_clicks: toNumber(row.keywords_with_clicks),
      keywords_with_conversions: toNumber(row.keywords_with_conversions),
      total_impressions: toNumber(row.total_impressions),
      total_clicks: toNumber(row.total_clicks),
      total_conversions: toNumber(row.total_conversions),
      avg_ctr: row.avg_ctr == null ? null : toNumber(row.avg_ctr),
      avg_cvr: row.avg_cvr == null ? null : toNumber(row.avg_cvr),
      click_to_conversion_pct: row.click_to_conversion_pct == null ? null : toNumber(row.click_to_conversion_pct),
    })),
    summary: {
      total_words: toNumber(summaryRow?.total_words),
      star_words: toNumber(summaryRow?.star_words),
      good_words: toNumber(summaryRow?.good_words),
      dead_words: toNumber(summaryRow?.dead_words),
      poor_words: toNumber(summaryRow?.poor_words),
      average_words: toNumber(summaryRow?.average_words),
      total_impressions: toNumber(summaryRow?.total_impressions),
      total_conversions: toNumber(summaryRow?.total_conversions),
      total_clicks: toNumber(summaryRow?.total_clicks),
      wasted_clicks: toNumber(summaryRow?.wasted_clicks),
      analysis_date: summaryRow?.analysis_date ?? null,
    },
  }
}