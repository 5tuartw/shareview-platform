import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'

type Params = {
  retailerId: string
}

type RequestBody = {
  is_enrolled?: boolean
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as RequestBody
    if (typeof body.is_enrolled !== 'boolean') {
      return NextResponse.json({ error: 'is_enrolled must be a boolean.' }, { status: 400 })
    }

    const { retailerId } = await params

    const result = await query<{
      retailer_id: string
      snapshot_enabled: boolean
    }>(
      `
        UPDATE retailers
        SET snapshot_enabled = $2,
            updated_at = NOW()
        WHERE retailer_id = $1
        RETURNING retailer_id, snapshot_enabled
      `,
      [retailerId, body.is_enrolled]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

    return NextResponse.json({
      retailer_id: result.rows[0].retailer_id,
      is_enrolled: result.rows[0].snapshot_enabled,
    })
  } catch (error) {
    console.error('Update retailer enrolment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
