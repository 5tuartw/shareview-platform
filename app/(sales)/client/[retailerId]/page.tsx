import { redirect } from 'next/navigation'

interface ClientPageProps {
  params: Promise<{ retailerId: string }>
}

export default async function ClientDashboardPageRoute({ params }: ClientPageProps) {
  const { retailerId } = await params
  redirect('/retailer/' + retailerId)
}
