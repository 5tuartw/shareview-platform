import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessRetailer } from '@/lib/permissions'
import { query } from '@/lib/db'
import {
  getAvailableMonthsWithBounds,
  getAvailableWeeks,
  type AvailableMonth,
} from '@/lib/analytics-utils'

const DOMAIN_ORDER = ['overview', 'keywords', 'categories', 'products', 'auctions'] as const

type DomainName = (typeof DOMAIN_ORDER)[number]

interface AvailabilityMeta {
  auctions: {
    months_with_any_data: string[]
    months_displayable: string[]
    latest_displayable_month: string | null
  }
}

const toMonthDate = (period: string): Date => new Date(`${period}-01T00:00:00Z`)

const toMonthKey = (date: Date): string => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

const addMonths = (date: Date, amount: number): Date => {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + amount)
  return next
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: retailerId } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'No access to this retailer' }, { status: 403 })
    }

    const monthlyByDomainEntries = await Promise.all(
      DOMAIN_ORDER.map(async (domain) => {
        const months = await getAvailableMonthsWithBounds(retailerId, domain)
        return [domain, months] as const
      })
    )

    const availableMonthsByDomain = Object.fromEntries(monthlyByDomainEntries) as Record<DomainName, AvailableMonth[]>

    const [auctionPreferredResult, auctionAnyResult] = await Promise.all([
      query<{ period: string }>(
        `SELECT to_char(month, 'YYYY-MM') AS period
         FROM auction_insights
         WHERE retailer_id = $1
           AND preferred_for_display = true
         GROUP BY month
         ORDER BY month`,
        [retailerId]
      ),
      query<{ period: string }>(
        `SELECT to_char(month, 'YYYY-MM') AS period
         FROM auction_insights
         WHERE retailer_id = $1
         GROUP BY month
         ORDER BY month`,
        [retailerId]
      ),
    ])

    const preferredAuctionMonths = auctionPreferredResult.rows.map((row) => row.period)
    const anyAuctionMonths = auctionAnyResult.rows.map((row) => row.period)

    if (preferredAuctionMonths.length > 0) {
      const existingByPeriod = new Map(
        (availableMonthsByDomain.auctions ?? []).map((month) => [month.period, month])
      )
      for (const period of preferredAuctionMonths) {
        if (!existingByPeriod.has(period)) {
          existingByPeriod.set(period, {
            period,
            actualStart: null,
            actualEnd: null,
          })
        }
      }
      availableMonthsByDomain.auctions = Array.from(existingByPeriod.values()).sort((a, b) =>
        a.period.localeCompare(b.period)
      )
    }

    const mergedMonthsByPeriod = new Map<string, AvailableMonth>()
    for (const domain of DOMAIN_ORDER) {
      for (const month of availableMonthsByDomain[domain]) {
        if (!mergedMonthsByPeriod.has(month.period)) {
          mergedMonthsByPeriod.set(month.period, month)
        }
      }
    }

    const orderedAvailableMonths = Array.from(mergedMonthsByPeriod.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    )

    const currentMonth = toMonthKey(new Date())
    const minMonth = orderedAvailableMonths.length > 0
      ? orderedAvailableMonths[0].period
      : currentMonth
    const maxMonthFromData = orderedAvailableMonths.length > 0
      ? orderedAvailableMonths[orderedAvailableMonths.length - 1].period
      : currentMonth
    const maxMonth = maxMonthFromData > currentMonth ? maxMonthFromData : currentMonth

    const monthTemplateByPeriod = new Map(orderedAvailableMonths.map((month) => [month.period, month]))
    const completeMonths: AvailableMonth[] = []
    for (let cursor = toMonthDate(minMonth); toMonthKey(cursor) <= maxMonth; cursor = addMonths(cursor, 1)) {
      const period = toMonthKey(cursor)
      const existing = monthTemplateByPeriod.get(period)
      completeMonths.push(
        existing ?? {
          period,
          actualStart: null,
          actualEnd: null,
        }
      )
    }

    const availableWeeks = await getAvailableWeeks(retailerId)

    const availabilityMeta: AvailabilityMeta = {
      auctions: {
        months_with_any_data: anyAuctionMonths,
        months_displayable: (availableMonthsByDomain.auctions ?? []).map((month) => month.period),
        latest_displayable_month:
          (availableMonthsByDomain.auctions ?? []).length > 0
            ? (availableMonthsByDomain.auctions ?? [])[availableMonthsByDomain.auctions.length - 1].period
            : null,
      },
    }

    return NextResponse.json({
      available_months: completeMonths,
      available_weeks: availableWeeks,
      available_months_by_domain: availableMonthsByDomain,
      availability_meta: availabilityMeta,
    })
  } catch (error) {
    console.error('Period availability error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
