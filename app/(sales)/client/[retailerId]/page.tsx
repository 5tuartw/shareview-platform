import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { hasRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import { logActivity } from '@/lib/activity-logger'
import ClientDashboardPage from '@/components/client/ClientDashboardPage'

interface ClientPageProps {
  params: Promise<{ retailerId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ClientDashboardPageRoute({ params, searchParams }: ClientPageProps) {
  const { retailerId } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center max-w-md">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Access denied</h1>
          <p className="text-sm text-gray-600 mb-6">
            You do not have permission to view client dashboards.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-md bg-[#1C1D1C] text-white hover:bg-black"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const headerList = await headers()
  const ipAddress = headerList.get('x-forwarded-for') || headerList.get('x-real-ip') || undefined
  const userAgent = headerList.get('user-agent') || undefined
  const fromParam = typeof resolvedSearchParams?.from === 'string' ? resolvedSearchParams.from : undefined

  const retailerCheck = await query('SELECT retailer_id FROM retailer_metadata WHERE retailer_id = $1', [retailerId])
  const safeRetailerId = retailerCheck.rows.length > 0 ? retailerId : undefined

  await logActivity({
    userId: parseInt(session.user.id, 10),
    action: 'retailer_viewed',
    retailerId: safeRetailerId,
    entityType: 'retailer',
    entityId: retailerId,
    details: { source: 'client_dashboard' },
    ipAddress,
    userAgent,
  })

  await logActivity({
    userId: parseInt(session.user.id, 10),
    action: 'client_viewed',
    retailerId: safeRetailerId,
    entityType: 'retailer',
    entityId: retailerId,
    details: { source: 'client_dashboard' },
    ipAddress,
    userAgent,
  })

  if (fromParam && fromParam !== retailerId) {
    await logActivity({
      userId: parseInt(session.user.id, 10),
      action: 'client_switched',
      retailerId: safeRetailerId,
      entityType: 'retailer',
      entityId: retailerId,
      details: { from_retailer_id: fromParam },
      ipAddress,
      userAgent,
    })
  }

  return <ClientDashboardPage retailerId={retailerId} />
}
