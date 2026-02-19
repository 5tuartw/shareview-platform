import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import { parsePeriodParam } from '@/lib/analytics-utils'
import { createReport } from '@/services/reports/create-report'
import {
  buildInsightsForPeriod,
  insertAIInsights,
} from '@/services/ai-insights-generator/generate-ai-insights'
import { transaction } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const session = await auth()

    // Require CLIENT_VIEWER or CLIENT_ADMIN role
    if (!session?.user?.role?.startsWith('CLIENT_')) {
      return NextResponse.json(
        { error: 'Unauthorized: Client access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { retailer_id, period, domains } = body

    if (!retailer_id || !period || !domains || !Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: retailer_id, period, domains' },
        { status: 400 }
      )
    }

    // Verify access to retailer
    if (!canAccessRetailer(session, retailer_id)) {
      return NextResponse.json(
        { error: 'Unauthorized: Cannot access this retailer' },
        { status: 403 }
      )
    }

    // Check allow_report_generate feature flag
    const configResult = await query(
      `SELECT features_enabled FROM retailer_config WHERE retailer_id = $1`,
      [retailer_id]
    )

    const features_enabled = configResult.rows[0]?.features_enabled || {}
    if (!features_enabled.allow_report_generate) {
      return NextResponse.json(
        { error: 'Report generation is not enabled for this retailer' },
        { status: 403 }
      )
    }

    // Parse period
    const { start, end } = parsePeriodParam(period)

    // Create report with auto_approve
    const report = await createReport({
      retailer_id,
      period_start: start,
      period_end: end,
      period_type: 'monthly',
      domains,
      report_type: 'client_generated',
      auto_approve: true,
      created_by: parseInt(session.user.id),
    })

    // Generate and auto-approve AI insights for each domain
    await transaction(async (client) => {
      for (const domain of domains) {
        // Build insights
        const result = await buildInsightsForPeriod(
          retailer_id,
          start,
          end,
          'client',
          domain
        )

        // Insert insights
        const insertedIds = await insertAIInsights(client, result.insights)

        // Auto-approve all insights and set is_active=true
        if (insertedIds.length > 0) {
          await client.query(
            `UPDATE ai_insights 
             SET status = 'approved', is_active = true
             WHERE id = ANY($1)`,
            [insertedIds]
          )

          // Link the first insight to the report_domain
          await client.query(
            `UPDATE report_domains 
             SET ai_insight_id = $1
             WHERE report_id = $2 AND domain = $3`,
            [insertedIds[0], report.id, domain]
          )
        }
      }
    })

    return NextResponse.json({ report_id: report.id }, { status: 201 })
  } catch (error) {
    console.error('Error generating client report:', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}
