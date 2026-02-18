import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { transaction } from '@/lib/db'
import {
  createGenerationJob,
  updateJobStatus,
  buildInsightsForPeriod,
  insertAIInsights,
  type PeriodToGenerate,
} from '@/services/ai-insights-generator/generate-ai-insights'

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to manage insights' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { retailer_id, page_type, tab_name, period_start, period_end } = body

    if (!retailer_id || !page_type || !tab_name || !period_start || !period_end) {
      return NextResponse.json(
        { error: 'Missing required fields: retailer_id, page_type, tab_name, period_start, period_end' },
        { status: 400 }
      )
    }

    const period: PeriodToGenerate = {
      retailerId: retailer_id,
      pageType: page_type,
      tabName: tab_name,
      periodStart: period_start,
      periodEnd: period_end,
      lastUpdated: new Date().toISOString(),
    }

    let jobId: number | undefined

    try {
      jobId = await createGenerationJob(period)
      await updateJobStatus(jobId, 'running')

      const result = await buildInsightsForPeriod(
        period.retailerId,
        period.periodStart,
        period.periodEnd,
        period.pageType,
        period.tabName
      )

      const inserted = await transaction(async (client) => {
        return insertAIInsights(client, result.insights)
      })

      await updateJobStatus(jobId, 'completed')

      return NextResponse.json({
        job_id: jobId,
        status: 'completed',
        insights_generated: inserted,
        errors: result.errors,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (jobId) {
        await updateJobStatus(jobId, 'failed', message)
      }
      throw error
    }
  } catch (error) {
    console.error('Error generating insights:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}
