'use client'

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Check, ChevronDown, LogOut, User, Users, FileText, Shield, UploadCloud, Tags, Settings2 } from 'lucide-react';
import { formatMonthKeyLong, getAuctionMonthFreshness } from '@/lib/domain-freshness';

interface DashboardHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
  retailerName?: string;
  showDateSelector?: boolean;
  showStaffMenu?: boolean;
  preloadedAuctionLatestMonth?: string | null;
  preloadedMarketProfileStatus?: {
    unassigned: number;
    unconfirmed: number;
  };
  children?: React.ReactNode;
}

export default function DashboardHeader({
  user,
  retailerName,
  showDateSelector,
  showStaffMenu,
  preloadedAuctionLatestMonth,
  preloadedMarketProfileStatus,
  children,
}: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const isStaff = user.role === 'SALES_TEAM' || user.role === 'CSS_ADMIN';

  const isRetailersActive = pathname === '/dashboard';
  const isPromptsActive = pathname === '/dashboard/report-prompts';
  const isSuperAdminActive = pathname === '/dashboard/super-admin';
  const isAuctionUploadActive = pathname === '/dashboard/auctions-upload';
  const isMarketProfilesActive = pathname === '/dashboard/market-profiles';
  const isManageRetailersActive = pathname === '/dashboard/manage-retailers';

  const [auctionLatestMonth, setAuctionLatestMonth] = useState<string | null>(preloadedAuctionLatestMonth ?? null);
  const [marketProfileStatus, setMarketProfileStatus] = useState<{
    unassigned: number;
    unconfirmed: number;
  }>(preloadedMarketProfileStatus ?? { unassigned: 0, unconfirmed: 0 });

  useEffect(() => {
    setAuctionLatestMonth(preloadedAuctionLatestMonth ?? null);
  }, [preloadedAuctionLatestMonth]);

  useEffect(() => {
    if (!preloadedMarketProfileStatus) return;
    setMarketProfileStatus(preloadedMarketProfileStatus);
  }, [preloadedMarketProfileStatus]);

  useEffect(() => {
    if (!showStaffMenu || !isStaff) return;
    if (preloadedAuctionLatestMonth !== undefined) return;
    fetch('/api/admin/auction-upload/status')
      .then(r => r.ok ? r.json() : null)
      .then((data: { latest_month?: string | null } | null) => {
        if (data?.latest_month) setAuctionLatestMonth(data.latest_month);
      })
      .catch(() => {});
  }, [showStaffMenu, isStaff, preloadedAuctionLatestMonth]);

  useEffect(() => {
    if (!showStaffMenu || !isStaff) return;
    if (preloadedMarketProfileStatus !== undefined) return;

    fetch('/api/admin/market-profiles/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { unassigned_count?: number; unconfirmed_count?: number } | null) => {
        if (!data) return;
        setMarketProfileStatus({
          unassigned: Number(data.unassigned_count ?? 0),
          unconfirmed: Number(data.unconfirmed_count ?? 0),
        });
      })
      .catch(() => {});
  }, [showStaffMenu, isStaff, preloadedMarketProfileStatus]);

  const auctionFreshness = getAuctionMonthFreshness(auctionLatestMonth);
  const auctionTooltip = auctionFreshness.colour === 'green'
    ? 'Up-to-date'
    : auctionFreshness.colour === 'amber'
      ? `${formatMonthKeyLong(auctionFreshness.expectedMonth)} auctions data is due`
      : `${formatMonthKeyLong(auctionFreshness.expectedMonth)} Auctions data is overdue`;

  const getRoleDisplay = (role?: string) => {
    if (!role) return '';
    const roleMap: Record<string, string> = {
      'SALES_TEAM': 'Staff',
      'CSS_ADMIN': 'Super Admin',
      'CLIENT_ADMIN': 'Client Admin',
      'CLIENT_VIEWER': 'Client Viewer',
    };
    return roleMap[role] || role;
  };

  return (
    <header className="bg-[#1C1D1C] py-1 shadow-md">
      <div className="max-w-[1800px] mx-auto px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Image
              src="/img/shareview_logo.png"
              alt="ShareView"
              width={240}
              height={60}
              className="h-15 w-auto object-contain"
            />

          <div>
            {showStaffMenu && isStaff ? (
              <div className="flex items-center justify-start gap-2">
                <button
                  onClick={() => router.push('/dashboard')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isRetailersActive 
                      ? 'bg-white/20 text-white' 
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Retailers
                </button>
                <button
                  onClick={() => router.push('/dashboard/report-prompts')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isPromptsActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Report Prompts
                </button>
                <button
                  onClick={() => router.push('/dashboard/auctions-upload')}
                  title={auctionTooltip}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isAuctionUploadActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  Auction Upload
                  {(() => {
                    const colour = auctionFreshness.colour;
                    const colourCls =
                      colour === 'green'
                        ? 'bg-green-500/25 text-green-300'
                        : colour === 'amber'
                        ? 'bg-amber-500/25 text-amber-300'
                        : 'bg-red-500/25 text-red-300';
                    return (
                      <span
                        className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${colourCls}`}
                      >
                        {colour === 'green' ? <Check className="w-3 h-3" /> : auctionFreshness.expectedMonth}
                      </span>
                    );
                  })()}
                </button>
                <button
                  onClick={() => router.push('/dashboard/market-profiles')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isMarketProfilesActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Tags className="w-4 h-4" />
                  Market Profiles
                  {marketProfileStatus.unassigned > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/25 text-red-300">
                      {marketProfileStatus.unassigned}
                    </span>
                  )}
                  {marketProfileStatus.unconfirmed > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/25 text-amber-300">
                      {marketProfileStatus.unconfirmed}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => router.push('/dashboard/manage-retailers')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isManageRetailersActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Settings2 className="w-4 h-4" />
                  Manage Retailers
                </button>
                {user.role === 'CSS_ADMIN' && (
                  <button
                    onClick={() => router.push('/dashboard/super-admin')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      isSuperAdminActive 
                        ? 'bg-white/20 text-white' 
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    Super Admin
                  </button>
                )}
              </div>
            ) : retailerName ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-white/60">ShareView Client Portal</p>
                <h1 className="text-lg font-semibold text-white">{retailerName}</h1>
              </div>
            ) : null}
          </div>
          </div>

          <div className="flex items-center gap-4">
            {showDateSelector && children}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-white hover:bg-white/10 transition-colors"
              >
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium">{user.name || user.email}</p>
                  <p className="text-xs text-gray-400">{getRoleDisplay(user.role)}</p>
                </div>
                <div className="md:hidden w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <ChevronDown className="w-4 h-4" />
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    <div className="md:hidden px-4 py-3 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
                      <p className="text-xs text-gray-500">{getRoleDisplay(user.role)}</p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
