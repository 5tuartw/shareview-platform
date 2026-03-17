import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import { fetchAuctionClassificationSettings } from '@/lib/auction-classification-config'

const clampThreshold = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
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

    const [settings, overridesResult, retailersResult] = await Promise.all([
      fetchAuctionClassificationSettings(),
      query<{
        retailer_id: string
        retailer_name: string
        overlap_high_threshold: string | number | null
        impression_share_high_threshold: string | number | null
        is_active: boolean
        updated_at: string | null
      }>(
        `SELECT o.retailer_id,
                r.retailer_name,
                o.overlap_high_threshold,
                o.impression_share_high_threshold,
                o.is_active,
                o.updated_at::text AS updated_at
         FROM auction_classification_overrides o
         JOIN retailers r ON r.retailer_id = o.retailer_id
         ORDER BY r.retailer_name ASC`
      ),
      query<{ retailer_id: string; retailer_name: string }>(
        `SELECT retailer_id, retailer_name
         FROM retailers
         ORDER BY retailer_name ASC`
      ),
    ])

    return NextResponse.json({
      settings: {
        overlap_high_threshold: settings.overlapHigh,
        impression_share_high_threshold: settings.impressionShareHigh,
      },
      overrides: overridesResult.rows.map((row) => ({
        retailer_id: row.retailer_id,
        retailer_name: row.retailer_name,
        overlap_high_threshold: row.overlap_high_threshold == null ? null : clampThreshold(Number(row.overlap_high_threshold)),
        impression_share_high_threshold: row.impression_share_high_threshold == null ? null : clampThreshold(Number(row.impression_share_high_threshold)),
        is_active: row.is_active,
        updated_at: row.updated_at,
      })),
      retailers: retailersResult.rows,
    })
  } catch (error) {
    console.error('Auction classification GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
      overlap_high_threshold?: number
      impression_share_high_threshold?: number
    } | null

    if (!body || body.overlap_high_threshold == null || body.impression_share_high_threshold == null) {
      return NextResponse.json(
        { error: 'overlap_high_threshold and impression_share_high_threshold are required' },
        { status: 400 },
      )
    }

    const overlap = clampThreshold(Number(body.overlap_high_threshold))
    const share = clampThreshold(Number(body.impression_share_high_threshold))

    await query(
      `INSERT INTO auction_classification_settings (id, overlap_high_threshold, impression_share_high_threshold, updated_by)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE
         SET overlap_high_threshold = EXCLUDED.overlap_high_threshold,
             impression_share_high_threshold = EXCLUDED.impression_share_high_threshold,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [overlap, share, session.user.id ? Number(session.user.id) : null],
    )

    return NextResponse.json({
      ok: true,
      settings: {
        overlap_high_threshold: overlap,
        impression_share_high_threshold: share,
      },
    })
  } catch (error) {
    console.error('Auction classification PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
      retailer_id?: string
      overlap_high_threshold?: number | null
      impression_share_high_threshold?: number | null
    } | null

    if (!body?.retailer_id) {
      return NextResponse.json({ error: 'retailer_id is required' }, { status: 400 })
    }

    const overlap = body.overlap_high_threshold == null ? null : clampThreshold(Number(body.overlap_high_threshold))
    const share = body.impression_share_high_threshold == null ? null : clampThreshold(Number(body.impression_share_high_threshold))

    await query(
      `INSERT INTO auction_classification_overrides (
          retailer_id,
          overlap_high_threshold,
          impression_share_high_threshold,
          is_active,
          updated_by,
          updated_at
       )
       VALUES ($1, $2, $3, TRUE, $4, NOW())
       ON CONFLICT (retailer_id) DO UPDATE
         SET overlap_high_threshold = EXCLUDED.overlap_high_threshold,
             impression_share_high_threshold = EXCLUDED.impression_share_high_threshold,
             is_active = TRUE,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [body.retailer_id, overlap, share, session.user.id ? Number(session.user.id) : null],
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Auction classification POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const retailerId = searchParams.get('retailer_id')
    if (!retailerId) {
      return NextResponse.json({ error: 'retailer_id is required' }, { status: 400 })
    }

    await query(
      `UPDATE auction_classification_overrides
       SET is_active = FALSE,
           updated_by = $2,
           updated_at = NOW()
       WHERE retailer_id = $1`,
      [retailerId, session.user.id ? Number(session.user.id) : null],
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Auction classification DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
