'use client'

import { DateRangeProvider } from '@/lib/contexts/DateRangeContext'

export default function SalesClientLayout({ children }: { children: React.ReactNode }) {
  return <DateRangeProvider>{children}</DateRangeProvider>
}
