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
    const showArchived = searchParams.get('showArchived') === 'true'

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

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''

    let result

    // Staff can see all reports, clients only see published ones
    if (canManageInsights(session)) {
      result = await query<ReportListItem & {
        token_id: number | null
        token_value: string | null
        token_expires_at: string | null
        token_is_active: boolean | null
      }>(
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
           r.include_insights,
           r.insights_require_approval,
           r.is_archived,
           r.auto_approve,
           r.approved_by,
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
           END as insight_status,
           rat.id as token_id,
           rat.token as token_value,
           rat.expires_at as token_expires_at,
           rat.is_active as token_is_active
         FROM reports r
         LEFT JOIN retailer_metadata rm ON r.retailer_id = rm.retailer_id
         LEFT JOIN report_domains rd ON r.id = rd.report_id
         LEFT JOIN retailer_access_tokens rat ON rat.report_id = r.id AND rat.is_active = true
         WHERE r.retailer_id = $1 AND r.is_archived = $2
         GROUP BY r.id, r.retailer_id, rm.retailer_name, r.period_start, r.period_end, 
                  r.period_type, r.status, r.report_type, r.title, r.is_active, r.hidden_from_retailer,
                  r.include_insights, r.insights_require_approval, r.is_archived, r.auto_approve, r.approved_by,
                  r.created_at, r.created_by, rat.id, rat.token, rat.expires_at, rat.is_active
         ORDER BY r.created_at DESC`,
        [retailerId, showArchived]
      )

      const rows = result.rows.map((row) => {
        const { token_id, token_value, token_expires_at, token_is_active, ...rest } = row as typeof row
        const tokenInfo =
          token_id
            ? {
                id: token_id,
                token: token_value!,
                url: `${baseUrl}/access/${token_value}`,
                expires_at: token_expires_at,
                is_active: token_is_active!,
              }
            : null
        return { ...rest, token_info: tokenInfo }
      })

      return NextResponse.json(rows)
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
         WHERE r.retailer_id = $1 AND r.is_active = true AND r.hidden_from_retailer = false AND r.is_archived = false
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

    const { retailer_id, period_start, period_end, period_type, title, description, domains, auto_approve, include_insights: bodyIncludeInsights, insights_require_approval: bodyInsightsRequireApproval } = body
    
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
    // Body values override retailer config when explicitly provided
    const includeAiInsights = bodyIncludeInsights !== undefined ? bodyIncludeInsights : (features_enabled.include_ai_insights ?? false)
    const insightsRequireApproval = bodyInsightsRequireApproval !== undefined ? bodyInsightsRequireApproval : (features_enabled.insights_require_approval ?? true)
    
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
        insightsRequireApproval,
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
