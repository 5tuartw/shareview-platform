import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to manage insights' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    const result = await query(
      `UPDATE ai_insights
       SET status = 'approved',
           is_active = true,
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, is_active`,
      [session.user.id, id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error approving insight:', error)
    return NextResponse.json(
      { error: 'Failed to approve insight' },
      { status: 500 }
    )
  }
}
