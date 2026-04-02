import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import DataHealthDashboard from '@/components/admin/DataHealthDashboard'

export default async function DataHealthPage() {
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
        <DataHealthDashboard />
      </div>
    </div>
  )
}
