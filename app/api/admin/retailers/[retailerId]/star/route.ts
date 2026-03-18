import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'

type Params = {
  retailerId: string
}

type RequestBody = {
  is_starred?: boolean
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
        { error: 'Forbidden: Staff or Super Admin role required' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as RequestBody
    if (typeof body.is_starred !== 'boolean') {
      return NextResponse.json({ error: 'is_starred must be a boolean.' }, { status: 400 })
    }

    const { retailerId } = await params

    const result = await query<{
      retailer_id: string
      high_priority: boolean
    }>(
      `
        UPDATE retailers
        SET high_priority = $2,
            updated_at = NOW()
        WHERE retailer_id = $1
        RETURNING retailer_id, high_priority
      `,
      [retailerId, body.is_starred]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

    return NextResponse.json({
      retailer_id: result.rows[0].retailer_id,
      is_starred: result.rows[0].high_priority,
    })
  } catch (error) {
    console.error('Update retailer starred state error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}