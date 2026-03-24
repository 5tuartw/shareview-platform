import Providers from '@/components/Providers'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>
}
