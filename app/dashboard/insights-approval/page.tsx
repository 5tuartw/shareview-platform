'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import InsightsApprovalDashboard from '@/components/admin/InsightsApprovalDashboard'

export default function InsightsApprovalPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  // Authentication check
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F59E0B]" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader user={session.user} showStaffMenu={true} />

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Insights Approval Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review and approve AI-generated insights before publication
          </p>
        </div>

        <InsightsApprovalDashboard />
      </div>
    </div>
  )
}
