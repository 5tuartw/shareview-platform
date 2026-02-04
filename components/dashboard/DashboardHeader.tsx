'use client'

import React, { useState } from 'react';
import { signOut } from 'next-auth/react';
import { ChevronDown, LogOut, User } from 'lucide-react';

interface DashboardHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

export default function DashboardHeader({ user }: DashboardHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

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
    <header className="bg-[#1C1D1C] py-4 shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <img 
              src="/img/shareview_logo.png" 
              alt="ShareView" 
              className="h-6 md:h-8 object-contain"
            />
            <h1 className="text-white text-base md:text-lg font-bold">Sales Team Dashboard</h1>
          </div>
          
          {/* User Menu */}
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
    </header>
  );
}
