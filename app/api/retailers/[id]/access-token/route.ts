import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasRole, canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import type { RetailerAccessTokenInfo, RetailerAccessTokenCreateResponse } from '@/types'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    // Check retailer access
    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const result = await query(
      `SELECT id, retailer_id, token, expires_at, password_hash, is_active, created_at
       FROM retailer_access_tokens 
       WHERE retailer_id = $1 AND is_active = true 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(null)
    }

    const row = result.rows[0]
    
    // Construct full URL from base and token
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    const fullUrl = `${baseUrl}/access/${row.token}`
    
    const tokenInfo: RetailerAccessTokenInfo = {
      id: row.id,
      retailer_id: row.retailer_id,
      token_masked: row.token.substring(0, 8) + '…',
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

    if (!session?.user || !hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    // Check retailer access
    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const { expires_at, password } = body

    // Generate token
    const token = crypto.randomBytes(48).toString('base64url')

    // Hash password if provided
    let passwordHash: string | null = null
    if (password) {
      passwordHash = await bcrypt.hash(password, 10)
    }

    // Deactivate previous tokens
    await query(
      'UPDATE retailer_access_tokens SET is_active = false WHERE retailer_id = $1',
      [id]
    )

    // Insert new token
    const result = await query(
      `INSERT INTO retailer_access_tokens 
        (retailer_id, token, password_hash, expires_at, is_active, created_by, created_at)
       VALUES ($1, $2, $3, $4, true, $5, NOW())
       RETURNING *`,
      [id, token, passwordHash, expires_at || null, parseInt(session.user.id)]
    )

    // Construct URL
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    const url = `${baseUrl}/access/${token}`

    const response: RetailerAccessTokenCreateResponse = {
      token,
      url,
      expires_at: result.rows[0].expires_at,
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

    if (!session?.user || !hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await context.params

    // Check retailer access
    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    // Deactivate all tokens for this retailer
    await query(
      'UPDATE retailer_access_tokens SET is_active = false WHERE retailer_id = $1',
      [id]
    )

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
