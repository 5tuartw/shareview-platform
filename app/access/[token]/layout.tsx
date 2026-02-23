'use client'

import { DateRangeProvider } from '@/lib/contexts/DateRangeContext'

export default function AccessTokenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DateRangeProvider>{children}</DateRangeProvider>
}
