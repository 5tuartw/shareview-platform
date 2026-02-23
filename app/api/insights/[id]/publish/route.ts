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

    // Check if insight is approved
    const checkResult = await query(
      `SELECT status FROM ai_insights WHERE id = $1`,
      [id]
    )

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      )
    }

    if (checkResult.rows[0].status !== 'approved') {
      return NextResponse.json(
        { error: 'Only approved insights can be published' },
        { status: 400 }
      )
    }

    const result = await query(
      `UPDATE ai_insights
       SET is_active = true,
           published_by = $1,
           published_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, is_active, published_by, published_at`,
      [session.user.id, id]
    )

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error publishing insight:', error)
    return NextResponse.json(
      { error: 'Failed to publish insight' },
      { status: 500 }
    )
  }
}
