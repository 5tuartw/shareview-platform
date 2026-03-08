import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import ManageRetailersDashboard from '@/components/admin/ManageRetailersDashboard'

export default async function ManageRetailersPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.role !== 'SALES_TEAM' && session.user.role !== 'CSS_ADMIN') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader user={session.user} showStaffMenu={true} />
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Manage Retailers</h1>
        <p className="mb-6 text-sm text-gray-600">
          Review retailer activity status, latest data dates, and manage enrolment.
        </p>
        <ManageRetailersDashboard />
      </div>
    </div>
  )
}
