'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import ReportsDashboard from '@/components/admin/ReportsDashboard'

export default function ReportsManagementPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.push('/login')
      return
    }

    const userRole = session.user?.role
    if (!userRole || !['SALES_TEAM', 'CSS_ADMIN'].includes(userRole)) {
      // Redirect clients to their retailer page
      if (userRole?.startsWith('CLIENT_')) {
        router.push('/client')
      } else {
        router.push('/login')
      }
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F59E0B]"></div>
      </div>
    )
  }

  if (!session || (session.user?.role !== 'SALES_TEAM' && session.user?.role !== 'CSS_ADMIN')) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <DashboardHeader user={session.user} showStaffMenu={true} />
      <main className="max-w-[1800px] mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Reports Management</h1>
        <ReportsDashboard />
      </main>
    </div>
  )
}
