import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasRole, canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import bcrypt from 'bcrypt'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id, tokenId } = await context.params

    const parsedTokenId = Number(tokenId)
    if (!Number.isInteger(parsedTokenId) || parsedTokenId <= 0) {
      return NextResponse.json(
        { error: 'Invalid tokenId. Expected a positive integer.' },
        { status: 400 }
      )
    }

    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    const { action, password } = (await request.json()) as {
      action?: 'add' | 'remove'
      password?: string
    }

    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json(
        { error: "Invalid action. Expected 'add' or 'remove'." },
        { status: 400 }
      )
    }

    if (action === 'add') {
      if (!password || typeof password !== 'string') {
        return NextResponse.json(
          { error: 'Password is required when action is add.' },
          { status: 400 }
        )
      }

      const passwordHash = await bcrypt.hash(password, 10)
      const updateResult = await query(
        `UPDATE retailer_access_tokens
         SET password_hash = $1
         WHERE id = $2 AND retailer_id = $3 AND is_active = true`,
        [passwordHash, parsedTokenId, id]
      )

      if (!updateResult.rowCount) {
        return NextResponse.json(
          { error: 'Active token not found for this retailer.' },
          { status: 404 }
        )
      }
    }

    if (action === 'remove') {
      const updateResult = await query(
        `UPDATE retailer_access_tokens
         SET password_hash = NULL
         WHERE id = $1 AND retailer_id = $2 AND is_active = true`,
        [parsedTokenId, id]
      )

      if (!updateResult.rowCount) {
        return NextResponse.json(
          { error: 'Active token not found for this retailer.' },
          { status: 404 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating access token password:', error)
    return NextResponse.json(
      {
        error: 'Failed to update access token password',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || !hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id, tokenId } = await context.params

    // Check retailer access
    if (!canAccessRetailer(session, id)) {
      return NextResponse.json(
        { error: 'Unauthorized: No access to this retailer' },
        { status: 403 }
      )
    }

    // Deactivate the specific token, scoped by retailer for safety
    await query(
      'UPDATE retailer_access_tokens SET is_active = false WHERE id = $1 AND retailer_id = $2',
      [parseInt(tokenId), id]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deactivating access token:', error)
    return NextResponse.json(
      {
        error: 'Failed to deactivate access token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
