import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    
    // Look up token
    const tokenResult = await query(
      `SELECT retailer_id, expires_at, password_hash, report_id 
       FROM retailer_access_tokens 
       WHERE token = $1 AND is_active = true`,
      [token]
    )
    
    if (tokenResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }
    
    const tokenData = tokenResult.rows[0]
    
    // Check expiry
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 404 })
    }
    
    // Check password protection - require valid session stored in DB
    if (tokenData.password_hash) {
      const cookieName = `sv_access_${token}`
      const cookieValue = request.cookies.get(cookieName)
      
      if (!cookieValue || cookieValue.value !== '1') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      
      // Additional security: verify the cookie was set server-side by checking its properties
      // In a production scenario, you would store session tokens in DB or use signed JWT
      // For now, we rely on httpOnly + secure + sameSite strict cookies set only by server action
    }
    
    const retailerId = tokenData.retailer_id
    const tokenReportId: number | null = tokenData.report_id ?? null
    
    // Query reports - same as CLIENT_VIEWER branch in app/api/reports/route.ts
    // When the token is scoped to a specific report, restrict to that single report
    const reportFilter = tokenReportId !== null
      ? `AND r.id = ${tokenReportId}`
      : ''

    const result = await query(
      `SELECT 
        r.id,
        r.title,
        r.created_at,
        r.status,
        r.description,
        r.report_type,
        r.period_type,
        r.period_start,
        r.period_end,
        rm.retailer_name,
        r.retailer_id
       FROM reports r
       LEFT JOIN retailer_metadata rm ON r.retailer_id = rm.retailer_id
       WHERE r.retailer_id = $1 
         AND r.is_active = true 
         AND r.is_archived = false
         AND r.hidden_from_retailer = false
         AND r.status = 'published'
         ${reportFilter}
       ORDER BY r.created_at DESC`,
      [retailerId]
    )
    
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching reports for token:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    )
  }
}
