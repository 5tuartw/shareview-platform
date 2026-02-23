import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import SuperAdminDashboard from '@/components/admin/SuperAdminDashboard'

export default async function SuperAdminPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.role !== 'CSS_ADMIN') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader user={session.user} showStaffMenu={true} />
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Super Admin</h1>
        <SuperAdminDashboard />
      </div>
    </div>
  )
}
