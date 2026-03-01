import { query } from '@/lib/db'
import { NextRequest } from 'next/server'

export type TokenValidationResult =
  | { valid: true; retailerId: string }
  | { valid: false; status: number; error: string }

/**
 * Validates an access token and checks that it grants access to the given retailer.
 * Also respects password-protected tokens (checks cookie).
 */
export async function validateAccessToken(
  request: NextRequest,
  token: string,
  retailerId: string
): Promise<TokenValidationResult> {
  const result = await query(
    `SELECT retailer_id, expires_at, password_hash
     FROM retailer_access_tokens
     WHERE token = $1 AND is_active = true`,
    [token]
  )

  if (result.rows.length === 0) {
    return { valid: false, status: 401, error: 'Invalid token' }
  }

  const row = result.rows[0]

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { valid: false, status: 401, error: 'Token expired' }
  }

  if (row.retailer_id !== retailerId) {
    return { valid: false, status: 403, error: 'Token does not grant access to this retailer' }
  }

  // Respect password protection
  if (row.password_hash) {
    const cookieName = `sv_access_${token}`
    const cookieValue = request.cookies.get(cookieName)
    if (!cookieValue || cookieValue.value !== '1') {
      return { valid: false, status: 401, error: 'Password required' }
    }
  }

  return { valid: true, retailerId }
}
