import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import bcrypt from 'bcrypt'
import { query } from '@/lib/db'
import RetailerClientDashboard from '@/components/client/RetailerClientDashboard'

async function validatePassword(formData: FormData) {
  'use server'
  
  const token = formData.get('token') as string
  const password = formData.get('password') as string
  
  if (!token || !password) {
    redirect(`/access/${token}?error=1`)
  }
  
  const result = await query(
    `SELECT password_hash FROM retailer_access_tokens 
     WHERE token = $1 AND is_active = true`,
    [token]
  )
  
  if (result.rows.length === 0) {
    redirect(`/access/${token}?error=1`)
  }
  
  const passwordHash = result.rows[0].password_hash
  const isValid = await bcrypt.compare(password, passwordHash)
  
  if (isValid) {
    const cookieStore = await cookies()
    cookieStore.set(`sv_access_${token}`, '1', {
      httpOnly: true,
      secure: true,
      maxAge: 86400,
      sameSite: 'strict',
    })
    redirect(`/access/${token}`)
  } else {
    redirect(`/access/${token}?error=1`)
  }
}

export default async function AccessTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string; pw?: string; reportId?: string }>
}) {
  const { token } = await params
  const { error, pw, reportId } = await searchParams
  
  // Look up token
  const tokenResult = await query(
    `SELECT retailer_id, expires_at, password_hash, report_id 
     FROM retailer_access_tokens 
     WHERE token = $1 AND is_active = true`,
    [token]
  )
  
  if (tokenResult.rows.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Link Not Found</h1>
          <p className="text-gray-600">The access link you're trying to use is invalid or has been deactivated.</p>
        </div>
      </div>
    )
  }
  
  const tokenData = tokenResult.rows[0]
  const retailerId = tokenData.retailer_id
  const expiresAt = tokenData.expires_at
  const passwordHash = tokenData.password_hash
  const tokenReportId: number | null = tokenData.report_id ?? null

  // Derive canonical reportId server-side from the token.
  // If the token is scoped to a specific report, that takes precedence over any query param.
  // If the query param is present but mismatches the token scope, normalise to the token value.
  let canonicalReportId: number | undefined
  if (tokenReportId !== null) {
    canonicalReportId = tokenReportId
    // If caller supplied a reportId that doesn't match the scoped token, normalise silently
    if (reportId && parseInt(reportId) !== tokenReportId) {
      console.warn(
        `[access/${token}] reportId query param (${reportId}) does not match token report_id (${tokenReportId}). Normalising to token value.`
      )
    }
  } else {
    // Token is not scoped to a report – trust the query param
    canonicalReportId = reportId ? parseInt(reportId) : undefined
  }
  
  // Check expiry
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Link Has Expired</h1>
          <p className="text-gray-600">This access link has expired. Please request a new one.</p>
        </div>
      </div>
    )
  }

  // Check if Live Data access is enabled for this retailer
  const configCheckResult = await query(
    `SELECT features_enabled FROM retailer_config WHERE retailer_id = $1`,
    [retailerId]
  )

  const features_enabled = configCheckResult.rows[0]?.features_enabled || {}
  const canAccessShareView = features_enabled.can_access_shareview ?? false
  const enableLiveData = features_enabled.enable_live_data ?? false

  if (!canAccessShareView || !enableLiveData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Not Available</h1>
          <p className="text-gray-600">Live Data access has been disabled for this retailer. Please contact your account manager.</p>
        </div>
      </div>
    )
  }
  
  // Check password requirement
  if (passwordHash) {
    const cookieStore = await cookies()
    const accessCookie = cookieStore.get(`sv_access_${token}`)
    
    if (!accessCookie) {
      // Check query param password
      if (pw) {
        const isValid = await bcrypt.compare(pw, passwordHash)
        if (isValid) {
          // Set cookie and continue to dashboard
          cookieStore.set(`sv_access_${token}`, '1', {
            httpOnly: true,
            secure: true,
            maxAge: 86400,
            sameSite: 'strict',
          })
        } else {
          // Show password form with error
          return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
              <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
                <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">Password Required</h1>
                <p className="text-red-600 mb-4 text-center">Incorrect password. Please try again.</p>
                <form action={validatePassword} className="space-y-4">
                  <input type="hidden" name="token" value={token} />
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition"
                  >
                    Access Dashboard
                  </button>
                </form>
              </div>
            </div>
          )
        }
      } else {
        // Show password form
        const hasError = error === '1'
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
              <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">Password Required</h1>
              {hasError && (
                <p className="text-red-600 mb-4 text-center">Incorrect password. Please try again.</p>
              )}
              <form action={validatePassword} className="space-y-4">
                <input type="hidden" name="token" value={token} />
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition"
                >
                  Access Dashboard
                </button>
              </form>
            </div>
          </div>
        )
      }
    }
  }
  
  // Load retailer metadata
  const metadataResult = await query(
    `SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1`,
    [retailerId]
  )
  
  const retailerName = metadataResult.rows[0]?.retailer_name || retailerId
  
  // Load retailer config
  const DEFAULT_TABS = ['overview', 'keywords', 'categories', 'products', 'auctions']
  const DEFAULT_METRICS = ['gmv', 'conversions', 'cvr', 'impressions', 'ctr', 'clicks', 'roi', 'validation_rate']
  const DEFAULT_FEATURES = {
    insights: true,
    competitor_comparison: true,
    market_insights: true,
  }
  
  const configResult = await query(
    `SELECT * FROM retailer_config WHERE retailer_id = $1`,
    [retailerId]
  )
  
  let config
  if (configResult.rows.length > 0) {
    const row = configResult.rows[0]
    const features = typeof row.features_enabled === 'string' ? JSON.parse(row.features_enabled) : row.features_enabled
    
    config = {
      retailer_id: retailerId,
      visible_tabs: row.visible_tabs || DEFAULT_TABS,
      visible_metrics: row.visible_metrics || DEFAULT_METRICS,
      keyword_filters: row.keyword_filters || [],
      features_enabled: features || DEFAULT_FEATURES,
      updated_by: row.updated_by || null,
      updated_at: row.updated_at || new Date().toISOString(),
    }
  } else {
    config = {
      retailer_id: retailerId,
      visible_tabs: DEFAULT_TABS,
      visible_metrics: DEFAULT_METRICS,
      keyword_filters: [],
      features_enabled: DEFAULT_FEATURES,
      updated_by: null,
      updated_at: new Date().toISOString(),
    }
  }
  
  return (
    <RetailerClientDashboard
      retailerId={retailerId}
      retailerName={retailerName}
      config={config}
      reportsApiUrl={`/api/access/${token}/reports`}
      reportId={canonicalReportId}
    />
  )
}
