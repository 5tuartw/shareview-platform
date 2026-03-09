import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole, canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import type { RetailerAccessTokenInfo, RetailerAccessTokenCreateResponse } from '@/types'
import { generateLinkPassword } from '@/lib/utils'

type TokenType = 'live_data' | 'report_access'

const isValidTokenType = (value: unknown): value is TokenType =>
  value === 'live_data' || value === 'report_access'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    const reportIdParam = searchParams.get('report_id')

    if (typeParam && !isValidTokenType(typeParam)) {
      return NextResponse.json(
        { error: "Invalid type. Expected 'live_data' or 'report_access'." },
        { status: 400 }
      )
    }

    const tokenType: TokenType = typeParam === 'report_access' ? 'report_access' : 'live_data'
    const parsedReportId = reportIdParam ? Number.parseInt(reportIdParam, 10) : null

    if (reportIdParam && (!parsedReportId || Number.isNaN(parsedReportId) || parsedReportId <= 0)) {
      return NextResponse.json(
        { error: 'report_id must be a positive integer when provided' },
        { status: 400 }
      )
    }

    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const result = await query(
      `SELECT id, retailer_id, token, token_type, report_id, expires_at, password_hash, is_active, created_at
       FROM retailer_access_tokens
       WHERE retailer_id = $1
         AND token_type = $2
         AND is_active = true
         AND ($3::int IS NULL OR report_id = $3)
       ORDER BY created_at DESC
       LIMIT 1`,
      [id, tokenType, parsedReportId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(null)
    }

    const row = result.rows[0]

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    const fullUrl = `${baseUrl}/access/${row.token}`

    const tokenInfo: RetailerAccessTokenInfo = {
      id: row.id,
      retailer_id: row.retailer_id,
      token_masked: row.token.substring(0, 8) + '…',
      token_type: row.token_type,
      url: fullUrl,
      expires_at: row.expires_at,
      has_password: row.password_hash !== null,
      is_active: row.is_active,
      created_at: row.created_at,
    }

    return NextResponse.json(tokenInfo)
  } catch (error) {
    console.error('Error fetching access token:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch access token',
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

    if (!session?.user || !await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const configResult = await query(
      `SELECT features_enabled, always_password_protect_links FROM retailers WHERE retailer_id = $1`,
      [id]
    )

    const features_enabled = configResult.rows[0]?.features_enabled || {}
    const canAccessShareView = features_enabled.can_access_shareview ?? false
    const enableLiveData = features_enabled.enable_live_data ?? false
    const enableReports = features_enabled.enable_reports ?? false

    const body = await request.json()
    const { expires_at, password, report_id, token_type } = body as {
      expires_at?: string | null
      password?: string | null
      report_id?: number | null
      token_type?: TokenType
    }

    if (token_type !== undefined && !isValidTokenType(token_type)) {
      return NextResponse.json(
        { error: "Invalid token_type. Expected 'live_data' or 'report_access'." },
        { status: 400 }
      )
    }

    const parsedReportId = report_id == null ? null : Number.parseInt(String(report_id), 10)
    if (report_id != null && (!parsedReportId || Number.isNaN(parsedReportId) || parsedReportId <= 0)) {
      return NextResponse.json(
        { error: 'report_id must be a positive integer when provided' },
        { status: 400 }
      )
    }

    const inferredTokenType: TokenType = parsedReportId != null ? 'report_access' : 'live_data'
    const resolvedTokenType: TokenType = token_type ?? inferredTokenType

    if (token_type && parsedReportId != null && token_type !== 'report_access') {
      return NextResponse.json(
        { error: "token_type must be 'report_access' when report_id is provided" },
        { status: 400 }
      )
    }

    if (resolvedTokenType === 'live_data') {
      if (!canAccessShareView || !enableLiveData) {
        return NextResponse.json(
          {
            error: 'Live Data access is not enabled for this retailer. Please enable it in settings first.',
            requires: {
              can_access_shareview: !canAccessShareView,
              enable_live_data: !enableLiveData,
            }
          },
          { status: 403 }
        )
      }
    } else if (!canAccessShareView || !enableReports) {
      return NextResponse.json(
        {
          error: 'Report access is not enabled for this retailer. Please enable ShareView and Reports in settings first.',
          requires: {
            can_access_shareview: !canAccessShareView,
            enable_reports: !enableReports,
          }
        },
        { status: 403 }
      )
    }

    const alwaysPasswordProtectLinks =
      configResult.rows[0]?.always_password_protect_links === true

    const token = crypto.randomBytes(48).toString('base64url')

    let plaintextPassword: string | undefined
    let passwordHash: string | null = null
    if (typeof password === 'string' && password.length > 0) {
      passwordHash = await bcrypt.hash(password, 10)
    } else if (alwaysPasswordProtectLinks) {
      plaintextPassword = generateLinkPassword()
      passwordHash = await bcrypt.hash(plaintextPassword, 10)
    }

    if (resolvedTokenType === 'report_access' && parsedReportId != null) {
      await query(
        `UPDATE retailer_access_tokens
         SET is_active = false
         WHERE retailer_id = $1
           AND token_type = $2
           AND report_id = $3`,
        [id, resolvedTokenType, parsedReportId]
      )
    } else {
      await query(
        `UPDATE retailer_access_tokens
         SET is_active = false
         WHERE retailer_id = $1
           AND token_type = $2
           AND report_id IS NULL`,
        [id, resolvedTokenType]
      )
    }

    const result = await query(
      `INSERT INTO retailer_access_tokens
        (retailer_id, token, token_type, password_hash, expires_at, is_active, report_id, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, NOW())
       RETURNING *`,
      [id, token, resolvedTokenType, passwordHash, expires_at || null, parsedReportId, parseInt(session.user.id)]
    )

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    const url = `${baseUrl}/access/${token}`

    const response: RetailerAccessTokenCreateResponse = {
      token,
      url,
      expires_at: result.rows[0].expires_at,
      plaintext_password: plaintextPassword,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error creating access token:', error)
    return NextResponse.json(
      {
        error: 'Failed to create access token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    const reportIdParam = searchParams.get('report_id')

    if (typeParam && !isValidTokenType(typeParam)) {
      return NextResponse.json(
        { error: "Invalid type. Expected 'live_data' or 'report_access'." },
        { status: 400 }
      )
    }

    const tokenType: TokenType = typeParam === 'report_access' ? 'report_access' : 'live_data'
    const parsedReportId = reportIdParam ? Number.parseInt(reportIdParam, 10) : null

    if (reportIdParam && (!parsedReportId || Number.isNaN(parsedReportId) || parsedReportId <= 0)) {
      return NextResponse.json(
        { error: 'report_id must be a positive integer when provided' },
        { status: 400 }
      )
    }

    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    if (tokenType === 'report_access' && parsedReportId != null) {
      await query(
        `UPDATE retailer_access_tokens
         SET is_active = false
         WHERE retailer_id = $1
           AND token_type = $2
           AND report_id = $3`,
        [id, tokenType, parsedReportId]
      )
    } else {
      await query(
        `UPDATE retailer_access_tokens
         SET is_active = false
         WHERE retailer_id = $1
           AND token_type = $2
           AND report_id IS NULL`,
        [id, tokenType]
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting access token:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete access token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
