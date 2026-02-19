import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { publishReport } from '@/services/reports/publish-report'

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

    const report = await publishReport(parseInt(id), parseInt(session.user.id))

    return NextResponse.json(report)
  } catch (error) {
    console.error('Error publishing report:', error)
    
    if (error instanceof Error) {
      // Check for specific error types and return appropriate status codes
      if (error.message === 'Report not found') {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        )
      }
      
      if (error.message === 'Report is already published') {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }
      
      if (error.message.includes('Cannot publish')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json(
      {
        error: 'Failed to publish report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
