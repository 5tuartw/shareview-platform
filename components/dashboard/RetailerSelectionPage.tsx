'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { SVBadge } from '@/components/shared';
import { Search, ArrowRight, Settings2, Star } from 'lucide-react';
import { formatMonthKeyLong, getAuctionMonthFreshness, getRecencyFreshness } from '@/lib/domain-freshness';

interface DomainHealth {
    status: 'ok' | 'no_source_data' | 'no_new_data' | 'unknown';
    last_attempted_at?: string | null;
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
    data_activity_status?: string;
    last_data_date?: string | null;
    is_enrolled?: boolean;
    is_active_retailer?: boolean;
    last_report_date?: string | null;
    report_count?: number;
    pending_report_count?: number;
    latest_data_at?: string | null;
    is_demo?: boolean;
    high_priority?: boolean;
    snapshot_health?: {
        overview?: DomainHealth;
        keywords?: DomainHealth;
        categories?: DomainHealth;
        products?: DomainHealth;
        auctions?: DomainHealth;
    } | null;
}

const DOMAIN_LABELS: { key: keyof NonNullable<Retailer['snapshot_health']>; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'keywords', label: 'ST' },
    { key: 'categories', label: 'Cat' },
    { key: 'products', label: 'Prod' },
    { key: 'auctions', label: 'Auct' },
]
const DEMO_ROUTE_ALIAS = 'demo'

const RETAILER_ROUTE_OVERRIDES: Record<string, string> = {
    demo: DEMO_ROUTE_ALIAS,
}

const getDisplayName = (retailer: Retailer): string => {
    return retailer.retailer_name
}

const getRetailerPathId = (retailer: Retailer): string => {
    return RETAILER_ROUTE_OVERRIDES[retailer.retailer_id] ?? retailer.retailer_id
}

const includeByFilter = (
    retailer: Retailer,
    filter: 'starred' | 'active' | 'all'
): boolean => {
    if (filter === 'starred') return isStarredRetailer(retailer)
    if (filter === 'active') return isActiveRetailer(retailer)
    return true
}

const isStarredRetailer = (retailer: Retailer): boolean => {
    if (retailer.is_demo === true) return true
    return retailer.high_priority === true
}

const isActiveRetailer = (retailer: Retailer): boolean => {
    if (typeof retailer.is_active_retailer === 'boolean') return retailer.is_active_retailer;
    const dataActive = (retailer.data_activity_status || '').toLowerCase() === 'active';
    const recentData = retailer.last_data_date
        ? (Date.now() - new Date(retailer.last_data_date).getTime()) <= 90 * 24 * 60 * 60 * 1000
        : false;
    return dataActive || recentData || retailer.is_enrolled === true;
}

const domainDotColour = (h?: DomainHealth, domain?: string) => {
    if (!h) return 'bg-red-500'
    if (h.status === 'no_new_data') return 'bg-green-500'
    if (h.status === 'no_source_data') return 'bg-orange-400'

    if (domain === 'auctions') {
        const auctionFreshness = getAuctionMonthFreshness(h.last_successful_period)
        if (auctionFreshness.colour === 'green') return 'bg-green-500'
        if (auctionFreshness.colour === 'amber') return 'bg-orange-400'
        return 'bg-red-500'
    }

    const freshness = getRecencyFreshness(h.last_successful_at)
    if (freshness === 'green') return 'bg-green-500'
    if (freshness === 'amber') return 'bg-orange-400'
    return 'bg-red-500'
}

const domainDotTitle = (label: string, h?: DomainHealth, domain?: string): string => {
    if (!h) return `${label}: overdue`
    if (h.status === 'no_new_data') return `${label}: Up-to-date (no new source changes)`
    if (h.status === 'no_source_data') return `${label}: No source data yet`

    if (domain === 'auctions') {
        const auctionFreshness = getAuctionMonthFreshness(h.last_successful_period)
        if (auctionFreshness.colour === 'green') return `${label}: Up-to-date`
        const monthLong = formatMonthKeyLong(auctionFreshness.expectedMonth)
        if (auctionFreshness.colour === 'amber') {
            return `${label}: ${monthLong} auctions data is due`
        }
        return `${label}: ${monthLong} Auctions data is overdue`
    }

    if (!h.last_successful_at) return `${label}: overdue`
    const freshness = getRecencyFreshness(h.last_successful_at)
    const ageHours = (Date.now() - new Date(h.last_successful_at).getTime()) / (1000 * 60 * 60)
    const roundedHours = Math.max(1, Math.round(ageHours))
    if (freshness === 'green') return `${label}: Up-to-date (${roundedHours}h ago)`
    if (freshness === 'amber') return `${label}: Due (${roundedHours}h ago)`
    return `${label}: Overdue (${roundedHours}h ago)`
}

type DataStatus = 'fresh' | 'warning' | { status: 'stale'; days: number } | null;

const getDataStatus = (retailer: Retailer): DataStatus => {
    if (retailer.is_demo) return null;
    const health = retailer.snapshot_health;
    if (!health) return null;

    const keys: Array<keyof NonNullable<Retailer['snapshot_health']>> = ['overview', 'keywords', 'categories', 'products', 'auctions'];
    let hasAmber = false;

    for (const key of keys) {
        const domainHealth = health[key];
        if (!domainHealth) return { status: 'stale', days: 1 };

        if (domainHealth.status === 'no_new_data') {
            continue;
        }

        if (domainHealth.status === 'no_source_data') {
            hasAmber = true;
            continue;
        }

        const colour = key === 'auctions'
            ? getAuctionMonthFreshness(domainHealth.last_successful_period).colour
            : getRecencyFreshness(domainHealth.last_successful_at);

        if (colour === 'red') return { status: 'stale', days: 1 };
        if (colour === 'amber') hasAmber = true;
    }

    if (hasAmber) return 'warning';
    return 'fresh';
};

const getSortPriority = (retailer: Retailer): number => {
    if (retailer.is_demo === true) return 0;
    if (isStarredRetailer(retailer)) return 1;
    return 2;
};

const getSortSecondaryPriority = (retailer: Retailer): number => {
    if (!isStarredRetailer(retailer) || retailer.is_demo === true) return 0;
    const ds = getDataStatus(retailer);
    if (ds && typeof ds === 'object' && ds.status === 'stale') return 0;
    if (ds === 'warning') return 1;
    return 2;
};

export default function RetailerSelectionPage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    const [retailers, setRetailers] = useState<Retailer[]>([]);
    const [headerAuctionLatestMonth, setHeaderAuctionLatestMonth] = useState<string | null>(null);
    const [headerMarketProfiles, setHeaderMarketProfiles] = useState<{ unassigned: number; unconfirmed: number } | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [retailerFilter, setRetailerFilter] = useState<'starred' | 'active' | 'all'>('starred');

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
                const summaryRes = await fetch('/api/dashboard/summary');
                if (summaryRes.ok) {
                    const summaryData = await summaryRes.json();
                    setRetailers(summaryData.retailers ?? []);
                    setHeaderAuctionLatestMonth(summaryData.header?.auction_upload?.latest_month ?? null);
                    setHeaderMarketProfiles({
                        unassigned: Number(summaryData.header?.market_profiles?.unassigned_count ?? 0),
                        unconfirmed: Number(summaryData.header?.market_profiles?.unconfirmed_count ?? 0),
                    });
                    return;
                }

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
        const byFilter = retailers.filter((r) => includeByFilter(r, retailerFilter))

        const filtered = searchQuery
            ? byFilter.filter(r => getDisplayName(r).toLowerCase().includes(searchQuery.toLowerCase()))
            : byFilter;

        return [...filtered].sort((a, b) => {
            const pa = getSortPriority(a);
            const pb = getSortPriority(b);
            if (pa !== pb) return pa - pb;
            const sa = getSortSecondaryPriority(a);
            const sb = getSortSecondaryPriority(b);
            if (sa !== sb) return sa - sb;
            return (b.report_count ?? 0) - (a.report_count ?? 0);
        });
    }, [retailers, searchQuery, retailerFilter]);

    const activeRetailerCount = useMemo(
        () => retailers.filter((r) => isActiveRetailer(r)).length,
        [retailers]
    );
    const allRetailerCount = retailers.length;
    const starredRetailerCount = useMemo(
        () => retailers.filter((r) => isStarredRetailer(r)).length,
        [retailers]
    );

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
            <DashboardHeader
                user={session.user}
                showStaffMenu={true}
                preloadedAuctionLatestMonth={headerAuctionLatestMonth}
                preloadedMarketProfileStatus={headerMarketProfiles}
            />
            <main className="bg-gray-50 min-h-screen">
                <div className="max-w-[1800px] mx-auto px-6 py-8 space-y-6">

                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">Retailers</h1>
                        <p className="text-gray-600 mt-1">Select a retailer to view their dashboard or reports.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg border border-gray-200">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
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
                            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden bg-white">
                                <button
                                    type="button"
                                    onClick={() => setRetailerFilter('starred')}
                                    title="Show starred retailers for prioritised monitoring"
                                    className={`px-3 py-2 text-xs font-medium ${
                                        retailerFilter === 'starred' ? 'bg-[#1C1D1C] text-white' : 'bg-white text-gray-700'
                                    }`}
                                >
                                    Starred ({starredRetailerCount})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRetailerFilter('active')}
                                    title="Show all retailers with recent activity"
                                    className={`px-3 py-2 text-xs font-medium border-l border-gray-300 ${
                                        retailerFilter === 'active' ? 'bg-[#1C1D1C] text-white' : 'bg-white text-gray-700'
                                    }`}
                                >
                                    Active Retailers ({activeRetailerCount})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRetailerFilter('all')}
                                    title="Show all retailers with data logged since January 2025"
                                    className={`px-3 py-2 text-xs font-medium border-l border-gray-300 ${
                                        retailerFilter === 'all' ? 'bg-[#1C1D1C] text-white' : 'bg-white text-gray-700'
                                    }`}
                                >
                                    All retailers ({allRetailerCount})
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => router.push('/dashboard/manage-retailers')}
                                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-md transition-colors whitespace-nowrap"
                            >
                                Manage Retailers <Settings2 className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => router.push('/dashboard/performance')}
                                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-md transition-colors whitespace-nowrap"
                            >
                                View all performance <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                        {filteredRetailers.map(retailer => {
                            const isStarred = isStarredRetailer(retailer);
                            const isDemo = retailer.is_demo === true;
                            const retailerPathId = getRetailerPathId(retailer);
                            const displayName = getDisplayName(retailer);
                            const ds = getDataStatus(retailer);
                            const isStale = ds && typeof ds === 'object' && ds.status === 'stale';
                            const isWarning = ds === 'warning';

                            const borderClass = isDemo
                                ? 'border-purple-400 ring-1 ring-purple-100 hover:border-purple-500'
                                : isStale
                                    ? 'border-red-400 ring-1 ring-red-100 hover:border-red-500'
                                    : isWarning
                                        ? 'border-orange-400 ring-1 ring-orange-100 hover:border-orange-500'
                                        : isStarred
                                            ? 'border-blue-400 ring-1 ring-blue-100 hover:border-blue-500'
                                            : 'border-gray-200 hover:border-gray-400';

                            const statusTooltip = isStarred ? 'Starred' : 'Standard';

                            return (
                                <div
                                    key={retailer.retailer_id}
                                    onClick={() => router.push('/dashboard/retailer/' + retailerPathId)}
                                    title={statusTooltip}
                                    className={`bg-white rounded-lg border p-5 cursor-pointer hover:shadow-md transition-all flex flex-col h-full group ${borderClass}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1 pr-2">{displayName}</h3>
                                        {isDemo && (
                                            <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                                                Demo
                                            </span>
                                        )}
                                        {!isDemo && isStarred && (
                                            <span className="flex-shrink-0" title="Starred retailer">
                                                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                            </span>
                                        )}
                                    </div>

                                    {retailer.snapshot_health && (
                                        <div className="flex items-center gap-2 mb-3">
                                            {DOMAIN_LABELS.map(({ key, label }) => {
                                                const h = retailer.snapshot_health?.[key]
                                                return (
                                                    <span
                                                        key={key}
                                                        title={domainDotTitle(label, h, key)}
                                                        className="flex items-center gap-1 text-xs text-gray-400"
                                                    >
                                                        <span className={`inline-block h-2 w-2 rounded-full ${isDemo ? 'bg-purple-400' : domainDotColour(h, key)}`} />
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
