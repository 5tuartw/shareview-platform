import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { hasRole } from '@/lib/permissions'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import AuctionUploadDashboard from '@/components/admin/AuctionUploadDashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Auction Insights Upload – Shareview' }

export default async function AuctionUploadPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader user={session.user} showStaffMenu={true} />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Auction Insights Upload</h1>
        <p className="text-sm text-gray-500 mb-8">
          Upload a monthly Google Ads Auction Insights CSV to add competitor data to Shareview.
        </p>
        <AuctionUploadDashboard />
      </div>
    </div>
  )
}
