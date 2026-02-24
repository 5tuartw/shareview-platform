'use client'

import React from 'react'
import { Clock } from 'lucide-react'

interface AuctionsTabProps {
  reportId?: number
  reportPeriod?: { start: string; end: string; type: string }
}

export default function AuctionsTab({}: AuctionsTabProps) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-gray-500">
      <Clock className="mb-3 h-8 w-8 text-gray-400" />
      <p className="text-sm font-medium">Auctions content coming soon.</p>
    </div>
  )
}
