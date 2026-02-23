'use client'

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ChevronDown, LogOut, User, Users, CheckCircle, FileText, Calendar, BarChart2, Shield } from 'lucide-react';

interface DashboardHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
  retailerName?: string;
  showDateSelector?: boolean;
  showStaffMenu?: boolean;
  children?: React.ReactNode;
}

export default function DashboardHeader({ user, retailerName, showDateSelector, showStaffMenu, children }: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const isStaff = user.role === 'SALES_TEAM' || user.role === 'CSS_ADMIN';

  const isRetailersActive = pathname === '/dashboard';
  const isInsightsActive = pathname === '/dashboard/insights-approval';
  const isReportsActive = pathname === '/dashboard/reports';
  const isSuperAdminActive = pathname === '/dashboard/super-admin';

  const getRoleDisplay = (role?: string) => {
    if (!role) return '';
    const roleMap: Record<string, string> = {
      'SALES_TEAM': 'Sales Team',
      'CSS_ADMIN': 'CSS Admin',
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
                  onClick={() => router.push('/dashboard/insights-approval')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isInsightsActive 
                      ? 'bg-white/20 text-white' 
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve Reports
                </button>
                <button
                  onClick={() => router.push('/dashboard/reports')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isReportsActive 
                      ? 'bg-white/20 text-white' 
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <BarChart2 className="w-4 h-4" />
                  Reports
                </button>
                <button
                  onClick={() => router.push('/dashboard/report-prompts')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors text-white/80 hover:text-white hover:bg-white/10"
                >
                  <FileText className="w-4 h-4" />
                  Report Prompts
                </button>
                <button
                  onClick={() => router.push('/dashboard/schedule')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Calendar className="w-4 h-4" />
                  Schedule
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
