export type FreshnessColour = 'green' | 'amber' | 'red'

const HOUR_MS = 1000 * 60 * 60

export function getRecencyFreshness(
  lastSuccessfulAt?: string | null,
  now: Date = new Date()
): FreshnessColour {
  if (!lastSuccessfulAt) return 'red'

  const ageHours = (now.getTime() - new Date(lastSuccessfulAt).getTime()) / HOUR_MS
  if (ageHours <= 26) return 'green'
  if (ageHours <= 50) return 'amber'
  return 'red'
}

export function getPreviousMonthKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const previousMonthDate = new Date(Date.UTC(year, month - 1, 1))
  const y = previousMonthDate.getUTCFullYear()
  const m = String(previousMonthDate.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function formatMonthKeyLong(period: string): string {
  const [yearRaw, monthRaw] = period.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!year || !month || month < 1 || month > 12) {
    return period
  }

  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function getAuctionMonthFreshness(
  latestMonth?: string | null,
  now: Date = new Date()
): { colour: FreshnessColour; expectedMonth: string; isUpToDate: boolean } {
  const expectedMonth = getPreviousMonthKey(now)

  if (latestMonth && latestMonth >= expectedMonth) {
    return { colour: 'green', expectedMonth, isUpToDate: true }
  }

  if (now.getDate() <= 3) {
    return { colour: 'amber', expectedMonth, isUpToDate: false }
  }

  return { colour: 'red', expectedMonth, isUpToDate: false }
}
