'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { SVBadge } from '@/components/shared';
import { Search, ArrowRight } from 'lucide-react';

interface DomainHealth {
    status: 'ok' | 'no_source_data' | 'no_new_data' | 'unknown';
    last_successful_at?: string | null;
    last_successful_period?: string | null;
    record_count?: number | null;
}

interface Retailer {
    retailer_id: string;
    retailer_name: string;
    category?: string;
    tier?: string;
    status: string;
    last_report_date?: string | null;
    report_count?: number;
    pending_report_count?: number;
    latest_data_at?: string | null;
    snapshot_health?: {
        keywords?: DomainHealth;
        categories?: DomainHealth;
        products?: DomainHealth;
        auctions?: DomainHealth;
    } | null;
}

const DOMAIN_LABELS: { key: keyof NonNullable<Retailer['snapshot_health']>; label: string }[] = [
    { key: 'keywords', label: 'ST' },
    { key: 'categories', label: 'Cat' },
    { key: 'products', label: 'Prod' },
    { key: 'auctions', label: 'Auct' },
]

// A no_new_data result just means the pipeline ran and found nothing new to write.
// This is normal for repeat runs on the same day. Only treat it as stale (orange)
// if the last successful write was more than 25 hours ago.
const STALE_THRESHOLD_HOURS = 25

const domainDotColour = (h?: DomainHealth) => {
    if (!h) return 'bg-gray-300'
    if (h.status === 'no_source_data') return 'bg-red-500'
    if (h.status === 'ok') return 'bg-green-500'
    if (h.status === 'no_new_data') {
        if (!h.last_successful_at) return 'bg-orange-400'
        const ageHours = (Date.now() - new Date(h.last_successful_at).getTime()) / (1000 * 60 * 60)
        return ageHours <= STALE_THRESHOLD_HOURS ? 'bg-green-500' : 'bg-orange-400'
    }
    return 'bg-gray-300'
}

const domainDotTitle = (label: string, h?: DomainHealth): string => {
    if (!h) return `${label}: no data`
    if (h.status === 'ok')
        return `${label}: up to date${h.last_successful_period ? ` (${h.last_successful_period})` : ''}${h.record_count != null ? ` · ${h.record_count.toLocaleString()} records` : ''}`
    if (h.status === 'no_new_data') {
        if (h.last_successful_at) {
            const ageHours = (Date.now() - new Date(h.last_successful_at).getTime()) / (1000 * 60 * 60)
            if (ageHours <= STALE_THRESHOLD_HOURS) {
                // Green — data is fresh, pipeline just had nothing new to write
                const ageLabel = ageHours < 1 ? '<1h ago' : `${Math.round(ageHours)}h ago`
                return `${label}: Updated ${ageLabel}${h.last_successful_period ? ` · last period ${h.last_successful_period}` : ''}`
            }
            return `${label}: no new data — last updated ${Math.round(ageHours)}h ago${h.last_successful_period ? ` (${h.last_successful_period})` : ''}`
        }
        return `${label}: no new data — no successful write yet`
    }
    if (h.status === 'no_source_data') return `${label}: missing from source data`
    return `${label}: unknown`
}

type DataStatus = 'fresh' | 'warning' | { status: 'stale'; days: number } | null;

const getDataStatus = (retailer: Retailer): DataStatus => {
    const isEnrolled = retailer.status?.toLowerCase() === 'active';
    if (!isEnrolled || !retailer.latest_data_at) return null;
    const ageHours = (Date.now() - new Date(retailer.latest_data_at).getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) return 'fresh';
    if (ageHours < 48) return 'warning';
    return { status: 'stale', days: Math.floor(ageHours / 24) };
};

const getSortPriority = (retailer: Retailer): number => {
    const isEnrolled = retailer.status?.toLowerCase() === 'active';
    if (!isEnrolled) return 3;
    const ds = getDataStatus(retailer);
    if (ds && typeof ds === 'object' && ds.status === 'stale') return 0; // red
    if (ds === 'warning') return 1;                                        // orange
    return 2;                                                               // blue (fresh or no data yet)
};

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
        const filtered = searchQuery
            ? retailers.filter(r => r.retailer_name.toLowerCase().includes(searchQuery.toLowerCase()))
            : retailers;

        return [...filtered].sort((a, b) => {
            const pa = getSortPriority(a);
            const pb = getSortPriority(b);
            if (pa !== pb) return pa - pb;
            return (b.report_count ?? 0) - (a.report_count ?? 0);
        });
    }, [retailers, searchQuery]);

    const formatReports = (retailer: Retailer): string => {
        if (!retailer.report_count) return 'No reports yet';
        const pending = retailer.pending_report_count ?? 0;
        return `Reports: Pending ${pending} · Total ${retailer.report_count}`;
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
                        {filteredRetailers.map(retailer => {
                            const isEnrolled = retailer.status?.toLowerCase() === 'active';
                            const ds = getDataStatus(retailer);
                            const isStale = ds && typeof ds === 'object' && ds.status === 'stale';
                            const isWarning = ds === 'warning';

                            const borderClass = isStale
                                ? 'border-red-400 ring-1 ring-red-100 hover:border-red-500'
                                : isWarning
                                    ? 'border-orange-400 ring-1 ring-orange-100 hover:border-orange-500'
                                    : isEnrolled
                                        ? 'border-blue-400 ring-1 ring-blue-100 hover:border-blue-500'
                                        : 'border-gray-200 hover:border-gray-400';

                            const enrolledTooltip = isEnrolled ? 'Enrolled' : 'Not enrolled';

                            return (
                                <div
                                    key={retailer.retailer_id}
                                    onClick={() => router.push('/dashboard/retailer/' + retailer.retailer_id)}
                                    title={enrolledTooltip}
                                    className={`bg-white rounded-lg border p-5 cursor-pointer hover:shadow-md transition-all flex flex-col h-full group ${borderClass}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1 pr-2">{retailer.retailer_name}</h3>
                                    </div>

                                    <div className="text-sm text-gray-500 mb-2 font-medium">
                                        {[retailer.category, retailer.tier].filter(Boolean).join(' · ') || 'No categorisation'}
                                    </div>

                                    {(isStale || isWarning) && (
                                        <div className={`text-xs font-medium mb-3 ${
                                            isStale ? 'text-red-600' : 'text-orange-600'
                                        }`}>
                                            {isStale
                                                ? `No new data for ${(ds as { status: 'stale'; days: number }).days} day${(ds as { status: 'stale'; days: number }).days === 1 ? '' : 's'}`
                                                : 'No new data for 1 day'
                                            }
                                        </div>
                                    )}

                                    {retailer.snapshot_health && (
                                        <div className="flex items-center gap-2 mb-3">
                                            {DOMAIN_LABELS.map(({ key, label }) => {
                                                const h = retailer.snapshot_health?.[key]
                                                return (
                                                    <span
                                                        key={key}
                                                        title={domainDotTitle(label, h)}
                                                        className="flex items-center gap-1 text-xs text-gray-400"
                                                    >
                                                        <span className={`inline-block h-2 w-2 rounded-full ${domainDotColour(h)}`} />
                                                        {label}
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    )}

                                    <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
                                        <span className="text-xs text-gray-500">
                                            {formatReports(retailer)}
                                        </span>
                                        <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                                    </div>
                                </div>
                            );
                        })}

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
