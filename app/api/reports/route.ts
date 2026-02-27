import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer, canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'
import { ReportListItem, CreateReportRequest } from '@/types'
import { createReport } from '@/services/reports/create-report'

export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const retailerId = searchParams.get('retailerId')

    if (!retailerId) {
      return NextResponse.json(
        { error: 'Missing required parameter: retailerId' },
        { status: 400 }
      )
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    let result

    // Staff can see all reports, clients only see published ones
    if (canManageInsights(session)) {
      result = await query<ReportListItem>(
        `SELECT 
           r.id, 
           r.retailer_id, 
           COALESCE(rm.retailer_name, r.retailer_id) as retailer_name,
           r.period_start, 
           r.period_end, 
           r.period_type, 
           r.status, 
           r.report_type, 
           r.title, 
           r.is_active, 
           r.hidden_from_retailer,
           r.created_at, 
           r.created_by,
           COALESCE(
             ARRAY_AGG(rd.domain ORDER BY rd.domain) FILTER (WHERE rd.domain IS NOT NULL),
             '{}'
           ) as domains,
           CASE
             WHEN NOT EXISTS(
               SELECT 1 FROM report_domains rd2
               WHERE rd2.report_id = r.id AND rd2.ai_insight_id IS NOT NULL
             ) THEN NULL
             WHEN EXISTS(
               SELECT 1 FROM report_domains rd3
               JOIN ai_insights ai ON rd3.ai_insight_id = ai.id
               WHERE rd3.report_id = r.id AND ai.status = 'pending'
             ) THEN 'pending'
             ELSE 'approved'
           END as insight_status
         FROM reports r
         LEFT JOIN retailer_metadata rm ON r.retailer_id = rm.retailer_id
         LEFT JOIN report_domains rd ON r.id = rd.report_id
         WHERE r.retailer_id = $1
         GROUP BY r.id, r.retailer_id, rm.retailer_name, r.period_start, r.period_end, 
                  r.period_type, r.status, r.report_type, r.title, r.is_active, r.hidden_from_retailer, 
                  r.created_at, r.created_by
         ORDER BY r.created_at DESC`,
        [retailerId]
      )
    } else {
      result = await query<ReportListItem>(
        `SELECT 
           r.id, 
           r.retailer_id, 
           COALESCE(rm.retailer_name, r.retailer_id) as retailer_name,
           r.period_start, 
           r.period_end, 
           r.period_type, 
           r.status, 
           r.report_type, 
           r.title, 
           r.is_active, 
           r.hidden_from_retailer,
           r.created_at, 
           r.created_by,
           COALESCE(
             ARRAY_AGG(rd.domain ORDER BY rd.domain) FILTER (WHERE rd.domain IS NOT NULL),
             '{}'
           ) as domains
         FROM reports r
         LEFT JOIN retailer_metadata rm ON r.retailer_id = rm.retailer_id
         LEFT JOIN report_domains rd ON r.id = rd.report_id
         WHERE r.retailer_id = $1 AND r.is_active = true AND r.hidden_from_retailer = false
         GROUP BY r.id, r.retailer_id, rm.retailer_name, r.period_start, r.period_end, 
                  r.period_type, r.status, r.report_type, r.title, r.is_active, r.hidden_from_retailer, 
                  r.created_at, r.created_by
         ORDER BY r.created_at DESC`,
        [retailerId]
      )
    }

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch reports',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user || !canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to create reports' },
        { status: 403 }
      )
    }

    const body: CreateReportRequest = await request.json()
    
    // Log the raw request body to debug period_type issue
    console.log('📝 Create Report Request Body:', JSON.stringify(body, null, 2))

    const { retailer_id, period_start, period_end, period_type, title, description, domains, auto_approve } = body
    
    console.log('📅 Period Type received:', period_type, 'Type:', typeof period_type)

    if (!retailer_id || !period_start || !period_end || !period_type) {
      return NextResponse.json(
        { error: 'Missing required fields: retailer_id, period_start, period_end, period_type' },
        { status: 400 }
      )
    }

    // Validate period_type against allowed values
    const allowedPeriodTypes = ['monthly', 'weekly', 'custom', 'client_generated']
    if (!allowedPeriodTypes.includes(period_type)) {
      return NextResponse.json(
        { 
          error: `Invalid period_type: '${period_type}'. Must be one of: ${allowedPeriodTypes.join(', ')}`,
          received: period_type,
          allowed: allowedPeriodTypes
        },
        { status: 400 }
      )
    }

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: domains (must be a non-empty array)' },
        { status: 400 }
      )
    }

    // Fetch retailer settings to determine approval requirements
    const configResult = await query(
      `SELECT features_enabled FROM retailer_config WHERE retailer_id = $1`,
      [retailer_id]
    )

    const features_enabled = configResult.rows[0]?.features_enabled || {}
    
    // Apply settings logic:
    // - If data_requires_approval is true, report needs approval
    // - If include_ai_insights is false, don't generate insights
    // - If insights_require_approval is true (and insights enabled), insights need approval
    const dataRequiresApproval = features_enabled.data_requires_approval ?? true
    const includeAiInsights = features_enabled.include_ai_insights ?? false
    const insightsRequireApproval = features_enabled.insights_require_approval ?? true
    
    // Auto-approve is only true if:
    // 1. Data doesn't require approval AND
    // 2. Either insights are disabled OR insights don't require approval
    const shouldAutoApprove = !dataRequiresApproval && (!includeAiInsights || !insightsRequireApproval)
    
    console.log('📋 Report Creation Settings:', {
      dataRequiresApproval,
      includeAiInsights,
      insightsRequireApproval,
      shouldAutoApprove,
      requestedAutoApprove: auto_approve
    })

    const report = await createReport(
      {
        retailerId: retailer_id,
        periodStart: period_start,
        periodEnd: period_end,
        periodType: period_type,
        title,
        description,
        domains,
        autoApprove: shouldAutoApprove,
        // Pass settings to control insight generation
        includeInsights: includeAiInsights,
      },
      parseInt(session.user.id)
    )

    return NextResponse.json(report)
  } catch (error) {
    console.error('Error creating report:', error)
    return NextResponse.json(
      {
        error: 'Failed to create report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
