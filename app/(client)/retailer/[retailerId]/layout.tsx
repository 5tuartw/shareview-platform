'use client'

import { DateRangeProvider } from '@/lib/contexts/DateRangeContext'

export default function RetailerLayout({ children }: { children: React.ReactNode }) {
  return <DateRangeProvider>{children}</DateRangeProvider>
}
