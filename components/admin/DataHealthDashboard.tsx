'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, ArrowLeft, AlertCircle, XCircle } from 'lucide-react'
import { getRecencyFreshness, getAuctionMonthFreshness, getPreviousMonthKey, formatMonthKeyLong, type FreshnessColour } from '@/lib/domain-freshness'
import { useRouter } from 'next/navigation'

interface DomainHealth {
  status: string | null
  last_successful_at: string | null
  last_successful_period: string | null
  record_count: number
}

interface RetailerHealth {
  retailer_id: string
  retailer_name: string
  status: string
  data_activity_status: string
  snapshot_enabled: boolean
  overview: DomainHealth | null
  keywords: DomainHealth | null
  categories: DomainHealth | null
  products: DomainHealth | null
  auctions: DomainHealth | null
}

type Domain = 'overview' | 'keywords' | 'categories' | 'products' | 'auctions'
type HealthFilter = 'all' | 'issues' | 'missing' | 'stale' | 'ok'

const DOMAINS: { key: Domain; label: string; short: string }[] = [
  { key: 'overview', label: 'Overview', short: 'OV' },
  { key: 'keywords', label: 'Search Terms', short: 'ST' },
  { key: 'categories', label: 'Categories', short: 'Cat' },
  { key: 'products', label: 'Products', short: 'Prod' },
  { key: 'auctions', label: 'Auctions', short: 'Auct' },
]

const DOMAIN_GROUPS: { label: string; caption: string; domains: Domain[] }[] = [
  { label: 'Overview', caption: 'Fetched from Affpro', domains: ['overview'] },
  { label: 'Google Ads', caption: 'Fetched from Google Ads APIs', domains: ['keywords', 'categories', 'products'] },
  { label: 'Auctions', caption: 'Uploaded at the end of the month', domains: ['auctions'] },
]

function getDomainFreshness(domain: Domain, h: DomainHealth | null): FreshnessColour {
  if (!h) return 'red'
  if (h.status === 'no_new_data') return 'green'
  if (h.status === 'no_source_data') return 'amber'

  if (domain === 'auctions') {
    return getAuctionMonthFreshness(h.last_successful_period).colour
  }
  return getRecencyFreshness(h.last_successful_at)
}

function getDomainLabel(domain: Domain, h: DomainHealth | null): string {
  if (!h) return 'No data'
  if (h.status === 'no_new_data') return `Up-to-date (no changes)`
  if (h.status === 'no_source_data') return 'No source data'

  if (domain === 'auctions') {
    const f = getAuctionMonthFreshness(h.last_successful_period)
    if (f.isUpToDate) return `Up-to-date (${h.last_successful_period})`
    return `Expected ${formatMonthKeyLong(f.expectedMonth)}, have ${h.last_successful_period ?? 'none'}`
  }

  if (!h.last_successful_at) return 'Never refreshed'
  const ageHours = Math.round((Date.now() - new Date(h.last_successful_at).getTime()) / (1000 * 60 * 60))
  const freshness = getRecencyFreshness(h.last_successful_at)
  if (freshness === 'green') return `${ageHours}h ago`
  if (freshness === 'amber') return `${ageHours}h ago (due)`
  return `${ageHours}h ago (overdue)`
}

const COLOUR_CLASSES: Record<FreshnessColour, string> = {
  green: 'bg-green-500',
  amber: 'bg-orange-400',
  red: 'bg-red-500',
}

const COLOUR_BG: Record<FreshnessColour, string> = {
  green: 'bg-green-50',
  amber: 'bg-orange-50',
  red: 'bg-red-50',
}

const COLOUR_TEXT: Record<FreshnessColour, string> = {
  green: 'text-green-700',
  amber: 'text-orange-700',
  red: 'text-red-700',
}

function hasIssue(r: RetailerHealth): boolean {
  return DOMAINS.some(d => getDomainFreshness(d.key, r[d.key]) !== 'green')
}

function hasMissing(r: RetailerHealth): boolean {
  return DOMAINS.some(d => r[d.key] === null)
}

function hasStale(r: RetailerHealth): boolean {
  return DOMAINS.some(d => {
    const f = getDomainFreshness(d.key, r[d.key])
    return f === 'amber' || (f === 'red' && r[d.key] !== null)
  })
}

export default function DataHealthDashboard() {
  const router = useRouter()
  const [retailers, setRetailers] = useState<RetailerHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<HealthFilter>('all')
  const [enrolledOnly, setEnrolledOnly] = useState(true)
  const [domainFilter, setDomainFilter] = useState<Domain | 'any' | 'google_ads'>('any')

  useEffect(() => {
    fetch('/api/admin/data-health')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(setRetailers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let list = retailers

    if (enrolledOnly) {
      list = list.filter(r => r.snapshot_enabled || r.data_activity_status === 'active')
    }

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.retailer_name.toLowerCase().includes(q) ||
        r.retailer_id.toLowerCase().includes(q)
      )
    }

    if (filter === 'issues') {
      list = list.filter(hasIssue)
    } else if (filter === 'missing') {
      list = list.filter(hasMissing)
    } else if (filter === 'stale') {
      list = list.filter(hasStale)
    } else if (filter === 'ok') {
      list = list.filter(r => !hasIssue(r))
    }

    if (domainFilter === 'google_ads') {
      const gaDomains: Domain[] = ['keywords', 'categories', 'products']
      list = list.filter(r =>
        gaDomains.some(dk => getDomainFreshness(dk, r[dk]) !== 'green')
      )
    } else if (domainFilter !== 'any') {
      list = list.filter(r => {
        const f = getDomainFreshness(domainFilter, r[domainFilter])
        return f !== 'green'
      })
    }

    return list
  }, [retailers, search, filter, enrolledOnly, domainFilter])

  // Summary stats
  const summary = useMemo(() => {
    const enrolled = retailers.filter(r => r.snapshot_enabled || r.data_activity_status === 'active')
    const domainStats: Record<Domain, { green: number; amber: number; red: number; missing: number }> = {
      overview:   { green: 0, amber: 0, red: 0, missing: 0 },
      keywords:   { green: 0, amber: 0, red: 0, missing: 0 },
      categories: { green: 0, amber: 0, red: 0, missing: 0 },
      products:   { green: 0, amber: 0, red: 0, missing: 0 },
      auctions:   { green: 0, amber: 0, red: 0, missing: 0 },
    }

    for (const r of enrolled) {
      for (const d of DOMAINS) {
        if (r[d.key] === null) {
          domainStats[d.key].missing++
        } else {
          const f = getDomainFreshness(d.key, r[d.key])
          domainStats[d.key][f]++
        }
      }
    }

    return { total: enrolled.length, domainStats }
  }, [retailers])

  const expectedAuctionMonth = formatMonthKeyLong(getPreviousMonthKey())

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-red-800">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="h-5 w-5" />
          Failed to load data health
        </div>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Data Health</h1>
          </div>
          <p className="text-sm text-gray-600 ml-8">
            Overview of data freshness across all enrolled retailers. Expected auction month: {expectedAuctionMonth}.
          </p>
        </div>
      </div>

      {/* Summary cards — grouped by source */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {DOMAIN_GROUPS.map(group => {
          // Aggregate stats across all domains in the group
          const groupStats = group.domains.reduce(
            (acc, dk) => {
              const s = summary.domainStats[dk]
              acc.green += s.green
              acc.amber += s.amber
              acc.red += s.red
              acc.missing += s.missing
              return acc
            },
            { green: 0, amber: 0, red: 0, missing: 0 }
          )
          const total = summary.total * group.domains.length
          const okPct = total > 0 ? Math.round((groupStats.green / total) * 100) : 0
          const isSingle = group.domains.length === 1
          const isGroupFilter = !isSingle && domainFilter === 'google_ads'
          const isActive = isGroupFilter || group.domains.some(dk => domainFilter === dk)
          const singleDk = isSingle ? group.domains[0] : null

          // For single-domain groups, the whole card is the button
          const CardTag = isSingle ? 'button' : 'div'
          const cardProps = isSingle
            ? { onClick: () => setDomainFilter(domainFilter === singleDk! ? 'any' : singleDk!) }
            : {}

          return (
            <CardTag
              key={group.label}
              {...cardProps}
              className={`rounded-lg border transition-all text-left ${
                isActive
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              } ${isSingle ? 'cursor-pointer' : ''}`}
            >
              <div
                className={`px-4 pt-3 pb-1 ${!isSingle ? 'cursor-pointer rounded-t-lg hover:bg-gray-50 transition-colors' : ''} ${isGroupFilter ? 'bg-blue-50' : ''}`}
                {...(!isSingle ? { onClick: () => setDomainFilter(domainFilter === 'google_ads' ? 'any' : 'google_ads'), role: 'button' } : {})}
              >
                <div className="text-sm font-medium text-gray-900">{group.label}</div>
                <div className="text-xs text-gray-500">{group.caption}</div>
              </div>
              <div className={`px-4 pb-3 flex gap-2 ${isSingle ? 'pt-2' : 'pt-1'}`}>
                {group.domains.map(dk => {
                  const d = DOMAINS.find(dd => dd.key === dk)!
                  const s = summary.domainStats[dk]
                  const dTotal = summary.total
                  const dPct = dTotal > 0 ? Math.round((s.green / dTotal) * 100) : 0

                  // For multi-domain groups, each domain is a clickable sub-button
                  // For single-domain groups, this is just a plain div (card handles click)
                  const InnerTag = isSingle ? 'div' : 'button'
                  const innerProps = isSingle
                    ? {}
                    : { onClick: () => setDomainFilter(domainFilter === dk ? 'any' : dk) }

                  return (
                    <InnerTag
                      key={dk}
                      {...innerProps}
                      className={`flex-1 rounded-md p-2 text-left transition-colors ${
                        !isSingle && domainFilter === dk ? 'bg-blue-100' : !isSingle ? 'hover:bg-gray-50' : ''
                      }`}
                    >
                      {!isSingle && (
                        <div className="text-xs font-medium text-gray-700 mb-1">{d.label}</div>
                      )}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-xs text-gray-600">{s.green}</span>
                        <span className="inline-block h-2 w-2 rounded-full bg-orange-400 ml-1" />
                        <span className="text-xs text-gray-600">{s.amber}</span>
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500 ml-1" />
                        <span className="text-xs text-gray-600">{s.red}</span>
                        {s.missing > 0 && (
                          <>
                            <XCircle className="h-3 w-3 text-gray-400 ml-1" />
                            <span className="text-xs text-gray-600">{s.missing}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{dPct}% up-to-date</div>
                    </InnerTag>
                  )
                })}
              </div>
            </CardTag>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search retailers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
          {([
            ['all', 'All'],
            ['issues', 'Issues'],
            ['missing', 'Missing'],
            ['stale', 'Stale'],
            ['ok', 'OK'],
          ] as [HealthFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filter === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={enrolledOnly}
            onChange={e => setEnrolledOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          Enrolled only
        </label>

        <span className="text-sm text-gray-500 ml-auto">
          {filtered.length} retailer{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Group header row */}
              <tr className="bg-gray-50 border-b border-gray-100">
                <th rowSpan={2} className="text-left px-4 py-2 font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 min-w-[200px] align-bottom border-b border-gray-200">
                  Retailer
                </th>
                <th className="text-center px-4 pt-2 pb-0.5 font-medium text-gray-500 text-xs tracking-wide uppercase border-x border-gray-100" colSpan={1}>
                  Affpro
                </th>
                <th className="text-center px-4 pt-2 pb-0.5 font-medium text-gray-500 text-xs tracking-wide uppercase border-x border-gray-100" colSpan={3}>
                  Google Ads APIs
                </th>
                <th className="text-center px-4 pt-2 pb-0.5 font-medium text-gray-500 text-xs tracking-wide uppercase border-x border-gray-100" colSpan={1}>
                  Manual Upload
                </th>
                <th rowSpan={2} className="text-center px-4 py-2 font-medium text-gray-700 w-20 align-bottom border-b border-gray-200">
                  Pattern
                </th>
              </tr>
              {/* Domain header row */}
              <tr className="bg-gray-50 border-b border-gray-200">
                {DOMAINS.map((d, i) => (
                  <th key={d.key} className={`text-left px-4 py-2 font-medium text-gray-700 min-w-[180px]${
                    i === 0 ? ' border-x border-gray-100' : i === 3 ? ' border-r border-gray-100' : i === 4 ? ' border-x border-gray-100' : ''
                  }`}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => {
                const colours = DOMAINS.map(d => getDomainFreshness(d.key, r[d.key]))
                const pattern = DOMAINS.map(d => r[d.key] ? (getDomainFreshness(d.key, r[d.key]) === 'green' ? '●' : '◐') : '○').join('')
                return (
                  <tr key={r.retailer_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
                      <div className="font-medium text-gray-900">{r.retailer_name}</div>
                      <div className="text-xs text-gray-400">{r.retailer_id}</div>
                    </td>
                    {DOMAINS.map((d, i) => {
                      const h = r[d.key]
                      const colour = colours[i]
                      const groupBorder = i === 0 ? ' border-x border-gray-50' : i === 3 ? ' border-r border-gray-50' : i === 4 ? ' border-x border-gray-50' : ''
                      return (
                        <td key={d.key} className={`px-4 py-2.5${groupBorder}`}>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                              h ? COLOUR_CLASSES[colour] : 'bg-gray-300'
                            }`} />
                            <span className={`text-xs ${h ? COLOUR_TEXT[colour] : 'text-gray-400'}`}>
                              {getDomainLabel(d.key, h)}
                            </span>
                          </div>
                          {h && h.last_successful_period && (
                            <div className="text-xs text-gray-400 ml-4.5 mt-0.5">
                              Period: {h.last_successful_period}
                              {h.record_count > 0 && <> · {h.record_count.toLocaleString()} rows</>}
                            </div>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex justify-center gap-0.5">
                        {DOMAINS.map((d, i) => (
                          <span
                            key={d.key}
                            title={d.label}
                            className={`inline-block h-2 w-2 rounded-full ${
                              r[d.key] ? COLOUR_CLASSES[colours[i]] : 'bg-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No retailers match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
