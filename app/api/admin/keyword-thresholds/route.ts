import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import { fetchKeywordThresholdTiers, fetchKeywordThresholdOverrides } from '@/lib/keyword-threshold-config'

const clampPositive = (value: number): number => {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [tiers, overrides, retailersResult] = await Promise.all([
      fetchKeywordThresholdTiers(),
      fetchKeywordThresholdOverrides(),
      query<{ retailer_id: string; retailer_name: string }>(
        `SELECT retailer_id, retailer_name FROM retailers ORDER BY retailer_name ASC`,
      ),
    ])

    return NextResponse.json({
      tiers,
      overrides,
      retailers: retailersResult.rows,
    })
  } catch (error) {
    console.error('Keyword thresholds GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PUT — update an existing tier */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as {
      id?: number
      tier_name?: string
      min_impressions?: number
      min_clicks?: number
      fallback_min_impressions?: number
      fallback_min_clicks?: number
      low_volume_trigger_qualified?: number
      low_volume_trigger_positive?: number
      is_default?: boolean
    } | null

    if (!body || !body.id) {
      return NextResponse.json({ error: 'Tier id is required' }, { status: 400 })
    }

    const updates: string[] = []
    const values: (string | number | boolean)[] = []
    let paramIndex = 1

    if (body.tier_name != null) {
      const name = String(body.tier_name).trim()
      if (!name) return NextResponse.json({ error: 'Tier name cannot be empty' }, { status: 400 })
      updates.push(`tier_name = $${paramIndex++}`)
      values.push(name)
    }
    if (body.min_impressions != null) { updates.push(`min_impressions = $${paramIndex++}`); values.push(clampPositive(body.min_impressions)) }
    if (body.min_clicks != null) { updates.push(`min_clicks = $${paramIndex++}`); values.push(clampPositive(body.min_clicks)) }
    if (body.fallback_min_impressions != null) { updates.push(`fallback_min_impressions = $${paramIndex++}`); values.push(clampPositive(body.fallback_min_impressions)) }
    if (body.fallback_min_clicks != null) { updates.push(`fallback_min_clicks = $${paramIndex++}`); values.push(clampPositive(body.fallback_min_clicks)) }
    if (body.low_volume_trigger_qualified != null) { updates.push(`low_volume_trigger_qualified = $${paramIndex++}`); values.push(clampPositive(body.low_volume_trigger_qualified)) }
    if (body.low_volume_trigger_positive != null) { updates.push(`low_volume_trigger_positive = $${paramIndex++}`); values.push(clampPositive(body.low_volume_trigger_positive)) }

    if (body.is_default === true) {
      // Clear other defaults first
      await query(`UPDATE keyword_threshold_tiers SET is_default = FALSE WHERE is_default = TRUE`)
      updates.push(`is_default = $${paramIndex++}`)
      values.push(true)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`updated_at = NOW()`)
    values.push(body.id)

    await query(
      `UPDATE keyword_threshold_tiers SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values,
    )

    const tiers = await fetchKeywordThresholdTiers()
    return NextResponse.json({ ok: true, tiers })
  } catch (error) {
    console.error('Keyword thresholds PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST — create a new tier or upsert a retailer override */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as {
      action?: 'create_tier' | 'upsert_override'
      // For create_tier
      tier_name?: string
      min_impressions?: number
      min_clicks?: number
      fallback_min_impressions?: number
      fallback_min_clicks?: number
      low_volume_trigger_qualified?: number
      low_volume_trigger_positive?: number
      // For upsert_override
      retailer_id?: string
      tier_id?: number | null
      custom_min_impressions?: number | null
      custom_min_clicks?: number | null
      custom_fallback_min_impressions?: number | null
      custom_fallback_min_clicks?: number | null
    } | null

    if (!body || !body.action) {
      return NextResponse.json({ error: 'action is required (create_tier or upsert_override)' }, { status: 400 })
    }

    if (body.action === 'create_tier') {
      const name = String(body.tier_name ?? '').trim()
      if (!name) return NextResponse.json({ error: 'tier_name is required' }, { status: 400 })

      const maxOrderResult = await query<{ max_order: number }>(
        `SELECT COALESCE(MAX(display_order), 0) + 1 as max_order FROM keyword_threshold_tiers`,
      )
      const nextOrder = maxOrderResult.rows[0]?.max_order ?? 1

      await query(
        `INSERT INTO keyword_threshold_tiers
          (tier_name, display_order, min_impressions, min_clicks, fallback_min_impressions, fallback_min_clicks,
           low_volume_trigger_qualified, low_volume_trigger_positive, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)`,
        [
          name,
          nextOrder,
          clampPositive(body.min_impressions ?? 50),
          clampPositive(body.min_clicks ?? 5),
          clampPositive(body.fallback_min_impressions ?? 30),
          clampPositive(body.fallback_min_clicks ?? 3),
          clampPositive(body.low_volume_trigger_qualified ?? 30),
          clampPositive(body.low_volume_trigger_positive ?? 20),
        ],
      )

      const tiers = await fetchKeywordThresholdTiers()
      return NextResponse.json({ ok: true, tiers })
    }

    if (body.action === 'upsert_override') {
      if (!body.retailer_id) {
        return NextResponse.json({ error: 'retailer_id is required' }, { status: 400 })
      }

      await query(
        `INSERT INTO keyword_threshold_overrides
          (retailer_id, tier_id, custom_min_impressions, custom_min_clicks,
           custom_fallback_min_impressions, custom_fallback_min_clicks,
           is_active, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
         ON CONFLICT (retailer_id) DO UPDATE SET
           tier_id = EXCLUDED.tier_id,
           custom_min_impressions = EXCLUDED.custom_min_impressions,
           custom_min_clicks = EXCLUDED.custom_min_clicks,
           custom_fallback_min_impressions = EXCLUDED.custom_fallback_min_impressions,
           custom_fallback_min_clicks = EXCLUDED.custom_fallback_min_clicks,
           is_active = TRUE,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [
          body.retailer_id,
          body.tier_id ?? null,
          body.custom_min_impressions ?? null,
          body.custom_min_clicks ?? null,
          body.custom_fallback_min_impressions ?? null,
          body.custom_fallback_min_clicks ?? null,
          session.user.id ? Number(session.user.id) : null,
        ],
      )

      const overrides = await fetchKeywordThresholdOverrides()
      return NextResponse.json({ ok: true, overrides })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Keyword thresholds POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE — remove a tier or deactivate an override */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const tierId = url.searchParams.get('tier_id')
    const retailerId = url.searchParams.get('retailer_id')

    if (tierId) {
      // Check tier isn't the default
      const tierResult = await query<{ is_default: boolean; override_count: string }>(
        `SELECT t.is_default,
                (SELECT COUNT(*)::text FROM keyword_threshold_overrides WHERE tier_id = t.id AND is_active = TRUE) as override_count
         FROM keyword_threshold_tiers t WHERE t.id = $1`,
        [Number(tierId)],
      )
      if (tierResult.rows.length === 0) {
        return NextResponse.json({ error: 'Tier not found' }, { status: 404 })
      }
      if (tierResult.rows[0].is_default) {
        return NextResponse.json({ error: 'Cannot delete the default tier' }, { status: 400 })
      }
      if (Number(tierResult.rows[0].override_count) > 0) {
        return NextResponse.json(
          { error: 'Cannot delete a tier that has active retailer overrides. Remove them first.' },
          { status: 400 },
        )
      }

      await query(`DELETE FROM keyword_threshold_tiers WHERE id = $1`, [Number(tierId)])
      const tiers = await fetchKeywordThresholdTiers()
      return NextResponse.json({ ok: true, tiers })
    }

    if (retailerId) {
      await query(
        `UPDATE keyword_threshold_overrides SET is_active = FALSE, updated_at = NOW() WHERE retailer_id = $1`,
        [retailerId],
      )
      const overrides = await fetchKeywordThresholdOverrides()
      return NextResponse.json({ ok: true, overrides })
    }

    return NextResponse.json({ error: 'tier_id or retailer_id query parameter required' }, { status: 400 })
  } catch (error) {
    console.error('Keyword thresholds DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
