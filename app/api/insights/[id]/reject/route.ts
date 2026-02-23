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

    if (!session?.user || !canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to manage insights' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    const result = await query(
      `UPDATE ai_insights
       SET status = 'rejected',
           is_active = false,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, is_active`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error rejecting insight:', error)
    return NextResponse.json(
      { error: 'Failed to reject insight' },
      { status: 500 }
    )
  }
}
