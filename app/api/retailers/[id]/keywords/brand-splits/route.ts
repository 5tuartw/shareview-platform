import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { hasActiveRole } from '@/lib/permissions'
import { logActivity } from '@/lib/activity-logger'
import { parsePeriod, serializeAnalyticsData } from '@/lib/analytics-utils'
import {
  BRAND_SPLIT_SCOPE_VALUES,
  isBrandSplitClassification,
  isBrandSplitScope,
  type BrandSplitClassification,
  type BrandSplitScope,
} from '@/lib/keyword-brand-splits'

type ScopePhraseRow = {
  retailer_name: string | null
  retailer_alias: string | null
  brand_id: string | null
  canonical_name: string | null
  alias_name: string | null
  brand_type: string | null
  brand_type_retailer_id: string | null
}

type SnapshotRow = {
  source_analysis_date: string | null
  actual_data_start: string | null
  actual_data_end: string | null
  total_search_terms: number | string
  total_impressions: number | string
  total_clicks: number | string
  total_conversions: number | string
  matched_vocab_count: number | string
  summary: Record<string, unknown>
}

const BRAND_SPLIT_DISCLAIMER =
  'Google Ads Search-Term-Attributed Conversions is based on whether the search term appeared in one step of the buyer\'s journey prior to making any purchase.'

function pushUnique(target: string[], value: string | null | undefined) {
  if (!value || !value.trim()) return
  if (target.includes(value)) return
  target.push(value)
}

const getScopePhrases = async (retailerId: string): Promise<Record<BrandSplitScope, string[]>> => {
  const retailerResult = await query<ScopePhraseRow>(
    `SELECT r.retailer_name,
            ra.alias_name AS retailer_alias,
            b.brand_id::text,
            b.canonical_name,
            ba.alias_name,
            b.brand_type,
            b.brand_type_retailer_id
     FROM retailers r
     LEFT JOIN retailer_aliases ra
       ON ra.retailer_id = r.retailer_id
      AND ra.is_active = true
     LEFT JOIN retailer_brand_presence rbp
       ON rbp.retailer_id = r.retailer_id
      AND rbp.is_current = true
     LEFT JOIN brands b
       ON b.brand_id = rbp.brand_id
      AND b.status = 'active'
     LEFT JOIN brand_aliases ba
       ON ba.brand_id = b.brand_id
     WHERE r.retailer_id = $1
     ORDER BY b.canonical_name ASC NULLS LAST, ba.alias_name ASC NULLS LAST, ra.alias_name ASC NULLS LAST`,
    [retailerId]
  )

  const retailerPrimary: string[] = []
  const retailerAliases: string[] = []
  const ownedPrimary: string[] = []
  const ownedAliases: string[] = []
  const linkedPrimary: string[] = []
  const linkedAliases: string[] = []

  for (const row of retailerResult.rows) {
    pushUnique(retailerPrimary, row.retailer_name)
    pushUnique(retailerAliases, row.retailer_alias)

    const isOwnedByRetailer = row.brand_type_retailer_id === retailerId && row.brand_type !== '3rd_party'
    const hasBrand = Boolean(row.brand_id)

    if (!hasBrand) continue

    pushUnique(linkedPrimary, row.canonical_name)
    pushUnique(linkedAliases, row.alias_name)

    if (isOwnedByRetailer) {
      pushUnique(ownedPrimary, row.canonical_name)
      pushUnique(ownedAliases, row.alias_name)
    }
  }

  return {
    retailer: [...retailerPrimary, ...retailerAliases],
    retailer_and_owned: [...retailerPrimary, ...retailerAliases, ...ownedPrimary, ...ownedAliases],
    retailer_owned_and_stocked: [...retailerPrimary, ...retailerAliases, ...ownedPrimary, ...ownedAliases, ...linkedPrimary.filter((value) => !ownedPrimary.includes(value)), ...linkedAliases.filter((value) => !ownedAliases.includes(value))],
  }
}

const getAvailableMonths = async (retailerId: string): Promise<string[]> => {
  const result = await query<{ period: string }>(
    `SELECT to_char(range_start, 'YYYY-MM') AS period
     FROM keyword_brand_split_snapshots
     WHERE retailer_id = $1
       AND range_type = 'month'
     GROUP BY range_start
     ORDER BY range_start ASC`,
    [retailerId]
  )

  return result.rows.map((row) => row.period)
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const canViewBrandSplits = await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])
    if (!canViewBrandSplits) {
      return NextResponse.json({ error: 'Unauthorized: Insufficient permissions' }, { status: 403 })
    }

    const tableResult = await query<{ exists: boolean }>(
      `SELECT to_regclass('public.keyword_brand_split_snapshots') IS NOT NULL AS exists`
    )

    if (!tableResult.rows[0]?.exists) {
      return NextResponse.json({ error: 'Brand Splits snapshot tables are not available yet' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const requestedPeriod = searchParams.get('period')
    const scopeParam = searchParams.get('scope') || 'retailer'
    const classificationParam = searchParams.get('classification') || 'all'
    const limit = Math.max(1, Math.min(300, Number(searchParams.get('limit') || '50')))

    if (!isBrandSplitScope(scopeParam)) {
      return NextResponse.json({ error: 'Invalid scope parameter' }, { status: 400 })
    }

    const classification =
      classificationParam === 'all'
        ? 'all'
        : isBrandSplitClassification(classificationParam)
          ? classificationParam
          : null

    if (!classification) {
      return NextResponse.json({ error: 'Invalid classification parameter' }, { status: 400 })
    }

    let period = requestedPeriod
    if (!period) {
      const latestResult = await query<{ latest_period: string | null }>(
        `SELECT to_char(MAX(range_start), 'YYYY-MM') AS latest_period
         FROM keyword_brand_split_snapshots
         WHERE retailer_id = $1
           AND range_type = 'month'
           AND brand_scope = $2`,
        [retailerId, scopeParam]
      )
      period = latestResult.rows[0]?.latest_period || null
    }

    if (!period) {
      return NextResponse.json({ error: 'No Brand Splits snapshot data available for this retailer' }, { status: 404 })
    }

    const { start, end } = parsePeriod(period)
    const rangeStart = start.toISOString().slice(0, 10)
    const rangeEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).toISOString().slice(0, 10)
    const availableMonths = await getAvailableMonths(retailerId)
    const scopePhrases = await getScopePhrases(retailerId)

    const snapshotResult = await query<SnapshotRow>(
      `SELECT source_analysis_date::text,
              actual_data_start::text,
              actual_data_end::text,
              total_search_terms,
              total_impressions,
              total_clicks,
              total_conversions,
              matched_vocab_count,
              summary
       FROM keyword_brand_split_snapshots
       WHERE retailer_id = $1
         AND range_type = 'month'
         AND range_start = $2::date
         AND range_end = $3::date
         AND brand_scope = $4
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [retailerId, rangeStart, rangeEnd, scopeParam]
    )

    if (snapshotResult.rows.length === 0) {
      const nearest_before = availableMonths.filter((value) => value < period!).slice(-1)[0] ?? null
      const nearest_after = availableMonths.find((value) => value > period!) ?? null

      return NextResponse.json(
        { error: 'No Brand Splits snapshot data available for this period', nearest_before, nearest_after },
        { status: 404 }
      )
    }

    const paramsList: Array<string | number> = [retailerId, rangeStart, rangeEnd, scopeParam, limit]
    let classificationClause = ''

    if (classification !== 'all') {
      paramsList.splice(4, 0, classification as BrandSplitClassification)
      classificationClause = 'AND classification = $5'
    }

    const limitParamIndex = classification === 'all' ? 5 : 6

    const termsResult = await query(
      `SELECT search_term,
              normalized_search_term,
              classification,
              matched_aliases,
              matched_brand_labels,
              total_impressions,
              total_clicks,
              total_conversions,
              ctr,
              cvr,
              share_of_total_conversions_pct
       FROM keyword_brand_split_term_snapshots
       WHERE retailer_id = $1
         AND range_start = $2::date
         AND range_end = $3::date
         AND brand_scope = $4
         ${classificationClause}
       ORDER BY total_conversions DESC, total_clicks DESC, search_term ASC
       LIMIT $${limitParamIndex}`,
      paramsList
    )

    await logActivity({
      userId: Number(session.user.id),
      action: 'retailer_viewed',
      retailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: {
        endpoint: 'brand-splits',
        period,
        scope: scopeParam,
        classification,
      },
    })

    return NextResponse.json(
      serializeAnalyticsData({
        period,
        scope: scopeParam,
        available_scopes: BRAND_SPLIT_SCOPE_VALUES,
        available_months: availableMonths,
        disclaimer: BRAND_SPLIT_DISCLAIMER,
        in_development: false,
        source_analysis_date: snapshotResult.rows[0].source_analysis_date,
        actual_data_start: snapshotResult.rows[0].actual_data_start,
        actual_data_end: snapshotResult.rows[0].actual_data_end,
        total_search_terms: snapshotResult.rows[0].total_search_terms,
        total_impressions: snapshotResult.rows[0].total_impressions,
        total_clicks: snapshotResult.rows[0].total_clicks,
        total_conversions: snapshotResult.rows[0].total_conversions,
        matched_vocab_count: snapshotResult.rows[0].matched_vocab_count,
        matched_phrases: scopePhrases[scopeParam as BrandSplitScope] || [],
        summary: snapshotResult.rows[0].summary,
        terms: termsResult.rows,
      })
    )
  } catch (error) {
    console.error('Error fetching keyword brand splits:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch Brand Splits data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}