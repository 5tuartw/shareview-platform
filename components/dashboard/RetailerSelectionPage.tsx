'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { SVBadge } from '@/components/shared';
import { Search, ArrowRight } from 'lucide-react';

interface Retailer {
    retailer_id: string;
    retailer_name: string;
    category?: string;
    tier?: string;
    status: string;
    last_report_date?: string | null;
}

export default function RetailerSelectionPage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    const [retailers, setRetailers] = useState<Retailer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (status === 'loading') return;

        if (!session?.user) {
            router.push('/login');
            return;
        }

        const { role, retailerIds } = session.user;
        if (role?.startsWith('CLIENT_')) {
            router.push('/retailer/' + (retailerIds?.[0] || ''));
            return;
        }

        if (!['SALES_TEAM', 'CSS_ADMIN'].includes(role || '')) {
            router.push('/login');
            return;
        }
    }, [session, status, router]);

    useEffect(() => {
        if (status !== 'authenticated') return;

        const fetchRetailers = async () => {
            try {
                const res = await fetch('/api/retailers');
                if (!res.ok) throw new Error('Failed to fetch retailers');
                const data = await res.json();
                setRetailers(data);
            } catch (error) {
                console.error('Error fetching retailers:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchRetailers();
    }, [status]);

    const filteredRetailers = useMemo(() => {
        if (!searchQuery) return retailers;
        return retailers.filter(r =>
            r.retailer_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [retailers, searchQuery]);

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return 'No reports yet';
        return `Last report: ${new Date(dateString).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-gray-300 border-t-[#1B1C1B] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (!session?.user || !['SALES_TEAM', 'CSS_ADMIN'].includes(session.user.role || '')) {
        return null;
    }

    return (
        <div className="min-h-screen bg-white">
            <DashboardHeader user={session.user} showStaffMenu={true} />
            <main className="bg-gray-50 min-h-screen">
                <div className="max-w-[1800px] mx-auto px-6 py-8 space-y-6">

                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">Retailers</h1>
                        <p className="text-gray-600 mt-1">Select a retailer to view their dashboard or reports.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg border border-gray-200">
                        <div className="relative w-full sm:w-96">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search retailers..."
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-[#1C1D1C] focus:border-[#1C1D1C] sm:text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={() => router.push('/dashboard/performance')}
                            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-md transition-colors whitespace-nowrap"
                        >
                            View all performance <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                        {filteredRetailers.map(retailer => (
                            <div
                                key={retailer.retailer_id}
                                onClick={() => router.push('/retailer/' + retailer.retailer_id)}
                                className="bg-white rounded-lg border border-gray-200 p-5 cursor-pointer hover:shadow-md hover:border-gray-400 transition-all flex flex-col h-full group"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">{retailer.retailer_name}</h3>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${retailer.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {retailer.status}
                                    </span>
                                </div>

                                <div className="text-sm text-gray-500 mb-6 font-medium">
                                    {[retailer.category, retailer.tier].filter(Boolean).join(' · ') || 'No categorisation'}
                                </div>

                                <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
                                    <span className="text-xs text-gray-500">
                                        {formatDate(retailer.last_report_date)}
                                    </span>
                                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                                </div>
                            </div>
                        ))}

                        {filteredRetailers.length === 0 && (
                            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-lg border border-gray-200 border-dashed">
                                No retailers found matching "{searchQuery}"
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}
