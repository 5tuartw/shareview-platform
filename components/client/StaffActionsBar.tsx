'use client'

import React from 'react'
import { Settings, Shield, TrendingUp, FileText } from 'lucide-react'

interface StaffActionsBarProps {
  retailerName: string
  onAccountManagement: () => void
  onAccountOptions: () => void
  onManageInsights: () => void
  onReportPrompts: () => void
}

export default function StaffActionsBar({
  retailerName,
  onAccountManagement,
  onAccountOptions,
  onManageInsights,
  onReportPrompts,
}: StaffActionsBarProps) {
  return (
    <div className="bg-[#F59E0B] border-b border-[#D97706]">
      <div className="max-w-[1800px] mx-auto px-6 py-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#78350F]" />
            <span className="text-sm font-semibold text-[#78350F]">
              Admin for {retailerName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAccountManagement}
              className="px-4 py-2 text-sm font-medium text-[#78350F] hover:text-[#451A03] hover:bg-[#FDE68A] rounded-md transition-colors"
            >
              Account
            </button>
            <button
              onClick={onAccountOptions}
              className="px-4 py-2 text-sm font-medium text-[#78350F] hover:text-[#451A03] hover:bg-[#FDE68A] rounded-md transition-colors"
            >
              Display
            </button>
            <button
              onClick={onManageInsights}
              className="px-4 py-2 text-sm font-medium text-[#78350F] hover:text-[#451A03] hover:bg-[#FDE68A] rounded-md transition-colors"
            >
              Manage Reports
            </button>
            <button
              onClick={onReportPrompts}
              className="px-4 py-2 text-sm font-medium text-[#78350F] hover:text-[#451A03] hover:bg-[#FDE68A] rounded-md transition-colors"
            >
              Report Prompts
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
