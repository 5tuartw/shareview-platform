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
        { error: 'Unauthorized: Insufficient permissions to publish reports' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    // Check if report exists and get status
    const checkResult = await query(
      `SELECT status FROM reports WHERE id = $1`,
      [id]
    )

    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const currentStatus = checkResult.rows[0].status

    // Allow publishing from draft or approved status
    if (currentStatus !== 'approved' && currentStatus !== 'draft') {
      return NextResponse.json(
        { error: 'Only approved or draft reports can be published' },
        { status: 400 }
      )
    }

    // Update report to published
    const result = await query(
      `UPDATE reports
       SET is_active = true,
           status = 'published',
           published_by = $1,
           published_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, is_active, published_at`,
      [session.user.id, id]
    )

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error publishing report:', error)
    return NextResponse.json(
      {
        error: 'Failed to publish report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
