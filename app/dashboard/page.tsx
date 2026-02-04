import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Only SALES_TEAM and CSS_ADMIN can access
  if (session.user.role !== 'SALES_TEAM' && session.user.role !== 'CSS_ADMIN') {
    redirect(`/retailer/${session.user.currentRetailerId || session.user.retailerIds?.[0]}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">Welcome back, {session.user.name}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Retailers</p>
              <p className="text-2xl font-bold">--</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-gray-600">Active Users</p>
              <p className="text-2xl font-bold">--</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-gray-600">GMV This Month</p>
              <p className="text-2xl font-bold">--</p>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">🎉 Authentication Implemented!</h3>
          <p className="text-blue-800">
            The authentication system is now fully operational. This placeholder dashboard will be replaced
            with the full SALES_TEAM interface in Phase 2.
          </p>
          <div className="mt-4">
            <p className="text-sm text-blue-700"><strong>Your Session:</strong></p>
            <pre className="mt-2 text-xs bg-white p-3 rounded border overflow-auto">
              {JSON.stringify(session.user, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
