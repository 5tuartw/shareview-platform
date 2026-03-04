import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { query, transaction } from '@/lib/db'
import { createReport } from '@/services/reports/create-report'
import type { RegenDiffResponse, SettingsDiff } from '@/types'
import type { VisibilityConfig } from '@/services/reports/capture-snapshot'
import type { PoolClient } from 'pg'

type RetailerConfigRow = {
  visible_tabs: string[] | null
  visible_metrics: string[] | null
  keyword_filters: string[] | null
  product_filters: string[] | null
  features_enabled: Record<string, boolean> | null
}

type VisibilityConfigInput = {
  visible_tabs?: string[] | null
  visible_metrics?: string[] | null
  keyword_filters?: string[] | null
  product_filters?: string[] | null
  features_enabled?: Record<string, boolean> | null
}

const normaliseVisibilityConfig = (
  config: VisibilityConfigInput | null | undefined
): VisibilityConfig => ({
  visible_tabs: config?.visible_tabs ?? [],
  visible_metrics: config?.visible_metrics ?? [],
  keyword_filters: config?.keyword_filters ?? [],
  product_filters: config?.product_filters ?? [],
  features_enabled: config?.features_enabled ?? {},
})

const toReadableValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  if (value === null || value === undefined) return ''
  return String(value)
}

const buildSettingsDiff = (
  storedConfig: VisibilityConfig,
  currentConfig: VisibilityConfig
): SettingsDiff[] => {
  const comparableFields: Array<keyof VisibilityConfig> = [
    'visible_tabs',
    'visible_metrics',
    'keyword_filters',
    'features_enabled',
  ]

  return comparableFields
    .filter((field) => JSON.stringify(storedConfig[field]) !== JSON.stringify(currentConfig[field]))
    .map((field) => ({
      setting: field,
      original: toReadableValue(storedConfig[field]),
      current: toReadableValue(currentConfig[field]),
    }))
}

const alignVisibleTabsToDomains = (
  config: VisibilityConfig,
  domains: string[]
): VisibilityConfig => ({
  ...config,
  visible_tabs: config.visible_tabs.filter((tab) => domains.includes(tab)),
})

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to regenerate reports' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    const reportResult = await query<{ retailer_id: string; visibility_config: VisibilityConfig | null }>(
      `SELECT retailer_id, visibility_config FROM reports WHERE id = $1`,
      [id]
    )

    if (reportResult.rows.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const report = reportResult.rows[0]

    const retailerConfigResult = await query<RetailerConfigRow>(
      `SELECT visible_tabs, visible_metrics, keyword_filters, product_filters, features_enabled
       FROM retailers WHERE retailer_id = $1`,
      [report.retailer_id]
    )

    const currentConfig = normaliseVisibilityConfig(retailerConfigResult.rows[0] ?? null)
    const storedConfig = normaliseVisibilityConfig(report.visibility_config)

    const diff = buildSettingsDiff(storedConfig, currentConfig)
    const response: RegenDiffResponse = {
      hasDiff: diff.length > 0,
      diff,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error comparing regenerate settings:', error)
    return NextResponse.json(
      {
        error: 'Failed to compare regenerate settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !canManageInsights(session)) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions to regenerate reports' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const body = (await request.json().catch(() => ({}))) as { useCurrentSettings?: boolean }
    const useCurrentSettings = body.useCurrentSettings ?? false

    // Fetch existing report
    const reportResult = await query(
      `SELECT retailer_id, period_start, period_end, period_type, title, 
              description, report_type, auto_approve, hidden_from_retailer, visibility_config
       FROM reports WHERE id = $1`,
      [id]
    )

    if (reportResult.rows.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const existingReport = reportResult.rows[0]

    // Fetch domains from report_domains
    const domainsResult = await query(
      `SELECT domain FROM report_domains WHERE report_id = $1 ORDER BY domain`,
      [id]
    )

    const domains = domainsResult.rows.map((row) => row.domain)

    let visibilityConfigOverride: VisibilityConfig | undefined
    if (useCurrentSettings) {
      const retailerConfigResult = await query<RetailerConfigRow>(
        `SELECT visible_tabs, visible_metrics, keyword_filters, product_filters, features_enabled
         FROM retailers WHERE retailer_id = $1`,
        [existingReport.retailer_id]
      )

      visibilityConfigOverride = alignVisibleTabsToDomains(
        normaliseVisibilityConfig(retailerConfigResult.rows[0] ?? null),
        domains
      )
    } else {
      visibilityConfigOverride = alignVisibleTabsToDomains(
        normaliseVisibilityConfig(existingReport.visibility_config),
        domains
      )
    }

    const regeneratedReport = await transaction(async (client: PoolClient) => {
      // Create new report using the same parameters, preserving metadata
      const newReport = await createReport(
        {
          retailerId: existingReport.retailer_id,
          periodStart: existingReport.period_start,
          periodEnd: existingReport.period_end,
          periodType: existingReport.period_type,
          title: existingReport.title || undefined,
          description: existingReport.description || undefined,
          domains,
          autoApprove: existingReport.auto_approve ?? false,
          reportType: existingReport.report_type,
          hiddenFromRetailer: existingReport.hidden_from_retailer ?? false,
          visibilityConfigOverride,
          dbClient: client,
        },
        parseInt(session.user.id)
      )

      // Force regenerated report back to draft workflow semantics
      await client.query(
        `UPDATE reports
         SET status = 'draft',
             is_active = false,
             approved_by = NULL,
             approved_at = NULL,
             published_by = NULL,
             published_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [newReport.id]
      )

      // Force regenerated domain insights back to pending workflow semantics
      await client.query(
        `UPDATE ai_insights ai
         SET status = 'pending',
             is_active = false,
             approved_by = NULL,
             approved_at = NULL,
             published_by = NULL,
             published_at = NULL,
             updated_at = NOW()
         FROM report_domains rd
         WHERE rd.report_id = $1
           AND rd.ai_insight_id = ai.id`,
        [newReport.id]
      )

      // Deactivate old report token in the same transaction unit
      await client.query(
        `UPDATE retailer_access_tokens SET is_active = false WHERE report_id = $1`,
        [id]
      )

      const refreshedResult = await client.query(
        `SELECT * FROM reports WHERE id = $1`,
        [newReport.id]
      )

      return refreshedResult.rows[0]
    })

    return NextResponse.json(regeneratedReport)
  } catch (error) {
    console.error('Error regenerating report:', error)
    return NextResponse.json(
      {
        error: 'Failed to regenerate report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
