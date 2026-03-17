import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import {
  classifyAuctionCompetitorQuadrant,
  AUCTION_QUADRANT_LABELS,
  type AuctionQuadrant,
} from '@/lib/auction-quadrants'
import {
  fetchAuctionClassificationOverrideMap,
  fetchAuctionClassificationSettings,
} from '@/lib/auction-classification-config'

type TrendMetricRow = {
  month_start: string
  competitor_name: string
  overlap_rate: number | null
  outranking_share: number | null
  impression_share: number | null
}

type CurrentMonthCompetitorRow = {
  competitor_name: string
  overlap_rate: number | null
  impression_share: number | null
  competitor_quadrant: string | null
}

const MAX_LOOKBACK = 24
const MIN_LOOKBACK = 3

const parseLookbackMonths = (value: string | null): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return 6
  return Math.min(MAX_LOOKBACK, Math.max(MIN_LOOKBACK, parsed))
}

const parseMonthStart = (period: string | null): string | null => {
  if (!period) return null
  const trimmed = period.trim()
  const month = trimmed.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  return `${month}-01`
}

const toPercent = (value: number | null): number | null => {
  if (value == null || Number.isNaN(value)) return null
  return value * 100
}

const allowedQuadrants = new Set<AuctionQuadrant>([
  'primary_competitors',
  'niche_emerging',
  'category_leaders',
])

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
    const lookbackMonths = parseLookbackMonths(searchParams.get('lookback_months'))

    let periodStart = parseMonthStart(searchParams.get('period'))

    if (!periodStart) {
      const latestResult = await query<{ month_start: string | null }>(
        `SELECT to_char(MAX(month), 'YYYY-MM-01') AS month_start
         FROM auction_insights
         WHERE retailer_id = $1
           AND preferred_for_display = TRUE`,
        [retailerId]
      )
      periodStart = latestResult.rows[0]?.month_start ?? null
    }

    if (!periodStart) {
      return NextResponse.json({
        period_start: null,
        lookback_months: lookbackMonths,
        periods: [],
        competitors: [],
        series: [],
      })
    }

    const globalThresholds = await fetchAuctionClassificationSettings()
    const retailerOverrides = await fetchAuctionClassificationOverrideMap([retailerId])
    const thresholds = {
      overlapHigh: retailerOverrides.get(retailerId)?.overlapHigh ?? globalThresholds.overlapHigh,
      impressionShareHigh: retailerOverrides.get(retailerId)?.impressionShareHigh ?? globalThresholds.impressionShareHigh,
    }

    const currentMonthCompetitors = await query<CurrentMonthCompetitorRow>(
      `SELECT
         shop_display_name AS competitor_name,
         AVG(overlap_rate::numeric) AS overlap_rate,
         AVG(impr_share::numeric) AS impression_share,
         mode() WITHIN GROUP (ORDER BY competitor_quadrant) AS competitor_quadrant
       FROM auction_insights
       WHERE retailer_id = $1
         AND month = $2::date
         AND preferred_for_display = TRUE
         AND is_self = FALSE
       GROUP BY shop_display_name`,
      [retailerId, periodStart]
    )

    const grouped = new Map<AuctionQuadrant, Array<{ competitor_name: string; rank_value: number }>>()
    for (const row of currentMonthCompetitors.rows) {
      const overlapRate = row.overlap_rate == null ? null : Number(row.overlap_rate)
      const impressionShare = row.impression_share == null ? null : Number(row.impression_share)

      const inferredQuadrant = row.competitor_quadrant && row.competitor_quadrant in AUCTION_QUADRANT_LABELS
        ? row.competitor_quadrant as AuctionQuadrant
        : classifyAuctionCompetitorQuadrant(overlapRate, impressionShare, false, thresholds)

      if (!allowedQuadrants.has(inferredQuadrant)) continue

      const rankValue = inferredQuadrant === 'category_leaders'
        ? (impressionShare ?? 0)
        : (overlapRate ?? 0)

      const existing = grouped.get(inferredQuadrant) ?? []
      existing.push({ competitor_name: row.competitor_name, rank_value: rankValue })
      grouped.set(inferredQuadrant, existing)
    }

    const sortedByGroup = (quadrant: AuctionQuadrant) =>
      (grouped.get(quadrant) ?? []).sort((a, b) => b.rank_value - a.rank_value)

    const defaultSelected = new Set<string>([
      ...sortedByGroup('primary_competitors').slice(0, 3).map((item) => item.competitor_name),
      ...sortedByGroup('niche_emerging').slice(0, 3).map((item) => item.competitor_name),
      ...sortedByGroup('category_leaders').slice(0, 3).map((item) => item.competitor_name),
    ])

    const competitorMeta = Array.from(grouped.entries())
      .flatMap(([quadrant, items]) =>
        items.map((item) => ({
          name: item.competitor_name,
          group: quadrant,
          group_label: AUCTION_QUADRANT_LABELS[quadrant],
          selected_by_default: defaultSelected.has(item.competitor_name),
        }))
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))

    if (competitorMeta.length === 0) {
      return NextResponse.json({
        period_start: periodStart,
        lookback_months: lookbackMonths,
        periods: [],
        competitors: [],
        series: [],
      })
    }

    const competitorNames = competitorMeta.map((item) => item.name)

    const trendResult = await query<TrendMetricRow>(
      `WITH month_window AS (
         SELECT generate_series(
           date_trunc('month', $2::date) - ($3::int - 1) * interval '1 month',
           date_trunc('month', $2::date),
           interval '1 month'
         )::date AS month_start
       )
       SELECT
         mw.month_start::text,
         ai.shop_display_name AS competitor_name,
         AVG(ai.overlap_rate::numeric) AS overlap_rate,
         AVG(ai.outranking_share::numeric) AS outranking_share,
         AVG(ai.impr_share::numeric) AS impression_share
       FROM month_window mw
       LEFT JOIN auction_insights ai
         ON ai.month = mw.month_start
        AND ai.retailer_id = $1
        AND ai.preferred_for_display = TRUE
        AND ai.is_self = FALSE
        AND ai.shop_display_name = ANY($4::text[])
       GROUP BY mw.month_start, ai.shop_display_name
       HAVING ai.shop_display_name IS NOT NULL
       ORDER BY mw.month_start ASC, ai.shop_display_name ASC`,
      [retailerId, periodStart, lookbackMonths, competitorNames]
    )

    const periods = Array.from(
      new Set(
        trendResult.rows.map((row) => row.month_start.slice(0, 10))
      )
    )

    return NextResponse.json({
      period_start: periodStart,
      lookback_months: lookbackMonths,
      periods,
      competitors: competitorMeta,
      series: trendResult.rows.map((row) => ({
        period_start: row.month_start.slice(0, 10),
        competitor_name: row.competitor_name,
        overlap_rate: toPercent(row.overlap_rate),
        outranking_share: toPercent(row.outranking_share),
        impression_share: toPercent(row.impression_share),
      })),
    })
  } catch (error) {
    console.error('Auction performance trends error:', error)
    return NextResponse.json({ error: 'Failed to load auction performance trends' }, { status: 500 })
  }
}
