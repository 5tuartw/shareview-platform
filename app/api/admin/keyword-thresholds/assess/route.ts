import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import { fetchKeywordThresholdTiers } from '@/lib/keyword-threshold-config'

type AssessmentResult = {
  retailer_id: string
  retailer_name: string
  avg_qualified_count: number
  avg_total_keywords: number
  months_used: number
  month_labels: string[]
  current_tier_name: string
  proposed_tier_id: number
  proposed_tier_name: string
  changed: boolean
  has_custom_values: boolean
}

/**
 * POST — run tier assessment (preview or apply).
 * Body: { apply?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as { apply?: boolean }

    // 1. Fetch tiers ordered by strictness (display_order ASC = strictest first)
    const tiers = await fetchKeywordThresholdTiers()
    if (tiers.length === 0) {
      return NextResponse.json({ error: 'No keyword threshold tiers configured' }, { status: 400 })
    }

    const defaultTier = tiers.find((t) => t.is_default) ?? tiers[0]

    // 2. Find the last 1-3 complete, non-December months with snapshot data
    const monthsResult = await query<{ range_start: string; range_end: string }>(
      `SELECT DISTINCT range_start, range_end
       FROM keywords_snapshots
       WHERE range_type = 'month'
         AND range_end <= DATE_TRUNC('month', CURRENT_DATE)
         AND EXTRACT(MONTH FROM range_start) != 12
       ORDER BY range_start DESC
       LIMIT 3`,
    )

    if (monthsResult.rows.length === 0) {
      return NextResponse.json({
        error: 'No complete non-December monthly snapshots available for assessment',
        results: [],
        months_analysed: [],
      }, { status: 200 })
    }

    const rangeStarts = monthsResult.rows.map((r) => r.range_start)
    const rangeEnds = monthsResult.rows.map((r) => r.range_end)

    // 3. Compute per-retailer averages over those months
    const averagesResult = await query<{
      retailer_id: string
      retailer_name: string
      avg_qualified_count: string
      avg_total_keywords: string
      months_used: string
      month_labels: string[]
      current_override_tier_id: number | null
      current_override_tier_name: string | null
      has_custom_values: boolean
    }>(
      `WITH selected_months AS (
         SELECT UNNEST($1::date[]) AS range_start, UNNEST($2::date[]) AS range_end
       ),
       retailer_averages AS (
         SELECT
           ks.retailer_id,
           AVG((ks.top_keywords->>'qualified_count')::numeric) AS avg_qualified_count,
           AVG(ks.total_keywords) AS avg_total_keywords,
           COUNT(*)::int AS months_used,
           array_agg(TO_CHAR(ks.range_start, 'Mon YYYY') ORDER BY ks.range_start) AS month_labels
         FROM keywords_snapshots ks
         JOIN selected_months sm
           ON ks.range_start = sm.range_start AND ks.range_end = sm.range_end
         WHERE ks.range_type = 'month'
         GROUP BY ks.retailer_id
       )
       SELECT
         ra.retailer_id,
         r.retailer_name,
         ROUND(ra.avg_qualified_count)::text AS avg_qualified_count,
         ROUND(ra.avg_total_keywords)::text AS avg_total_keywords,
         ra.months_used::text,
         ra.month_labels,
         o.tier_id AS current_override_tier_id,
         t.tier_name AS current_override_tier_name,
         CASE WHEN o.custom_min_impressions IS NOT NULL
           OR o.custom_min_clicks IS NOT NULL
           OR o.custom_fallback_min_impressions IS NOT NULL
           OR o.custom_fallback_min_clicks IS NOT NULL
         THEN TRUE ELSE FALSE END AS has_custom_values
       FROM retailer_averages ra
       JOIN retailers r ON r.retailer_id = ra.retailer_id
       LEFT JOIN keyword_threshold_overrides o
         ON o.retailer_id = ra.retailer_id AND o.is_active = TRUE
       LEFT JOIN keyword_threshold_tiers t ON t.id = o.tier_id
       ORDER BY r.retailer_name`,
      [rangeStarts, rangeEnds],
    )

    // 4. Assign each retailer to a tier based on avg_qualified_count
    const results: AssessmentResult[] = averagesResult.rows.map((row) => {
      const avgQualified = Number(row.avg_qualified_count)
      const currentTierName = row.current_override_tier_name ?? defaultTier.tier_name

      // Walk through tiers strictest-first; assign first tier where
      // avg_qualified >= that tier's low_volume_trigger_qualified
      let proposedTier = tiers[tiers.length - 1] // fallback to most lenient
      for (const tier of tiers) {
        if (avgQualified >= tier.low_volume_trigger_qualified) {
          proposedTier = tier
          break
        }
      }

      return {
        retailer_id: row.retailer_id,
        retailer_name: row.retailer_name,
        avg_qualified_count: avgQualified,
        avg_total_keywords: Number(row.avg_total_keywords),
        months_used: Number(row.months_used),
        month_labels: row.month_labels,
        current_tier_name: currentTierName,
        proposed_tier_id: proposedTier.id,
        proposed_tier_name: proposedTier.tier_name,
        changed: proposedTier.tier_name !== currentTierName,
        has_custom_values: row.has_custom_values === true,
      }
    })

    const monthLabels = monthsResult.rows
      .map((r) => {
        const d = new Date(r.range_start)
        return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      })
      .reverse() // chronological order

    // 5. If apply requested, upsert overrides for changed retailers
    let applied = 0
    let skippedCustom = 0
    if (body.apply) {
      const userId = session.user.id ? Number(session.user.id) : null

      for (const result of results) {
        // Skip retailers with custom override values — don't overwrite manual tweaks
        if (result.has_custom_values) {
          skippedCustom++
          continue
        }

        if (result.proposed_tier_id === defaultTier.id) {
          // Proposed = default: remove any existing override (they'll fall through to default)
          await query(
            `DELETE FROM keyword_threshold_overrides WHERE retailer_id = $1`,
            [result.retailer_id],
          )
          if (result.changed) applied++
        } else {
          // Proposed != default: upsert override with the proposed tier
          await query(
            `INSERT INTO keyword_threshold_overrides
              (retailer_id, tier_id, is_active, updated_by)
             VALUES ($1, $2, TRUE, $3)
             ON CONFLICT (retailer_id) DO UPDATE SET
               tier_id = EXCLUDED.tier_id,
               custom_min_impressions = NULL,
               custom_min_clicks = NULL,
               custom_fallback_min_impressions = NULL,
               custom_fallback_min_clicks = NULL,
               is_active = TRUE,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
            [result.retailer_id, result.proposed_tier_id, userId],
          )
          if (result.changed) applied++
        }
      }
    }

    return NextResponse.json({
      months_analysed: monthLabels,
      results,
      summary: {
        total: results.length,
        changed: results.filter((r) => r.changed).length,
        unchanged: results.filter((r) => !r.changed).length,
        custom_skipped: results.filter((r) => r.has_custom_values).length,
        tier_counts: tiers.map((t) => ({
          tier_name: t.tier_name,
          count: results.filter((r) => r.proposed_tier_name === t.tier_name).length,
        })),
      },
      ...(body.apply ? { applied, skipped_custom: skippedCustom } : {}),
    })
  } catch (error) {
    console.error('Keyword threshold assessment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
