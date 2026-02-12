import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import DashboardHeader from '@/components/dashboard/DashboardHeader'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader user={{ name: session.user.name, email: session.user.email, role: session.user.role }} />
      {children}
    </div>
  )
}
