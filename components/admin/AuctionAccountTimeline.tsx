'use client'

import { useState, useEffect } from 'react'

interface TimelineRow {
  slug: string
  account_name: string
  customer_id: string
  month: string
  data_source: string
  is_preferred: boolean
}

interface AuctionAccountTimelineProps {
  retailerId: string
}

// Colour coding for data sources
const DATA_SOURCE_COLOUR: Record<string, string> = {
  dedicated: 'bg-green-500',
  shared_account: 'bg-blue-400',
  transition: 'bg-amber-400',
}

const DATA_SOURCE_LABEL: Record<string, string> = {
  dedicated: 'Dedicated',
  shared_account: 'Shared',
  transition: 'Transition',
}

export default function AuctionAccountTimeline({ retailerId }: AuctionAccountTimelineProps) {
  const [rows, setRows] = useState<TimelineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/retailers/${retailerId}/auction-timeline`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setRows(data.rows)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load timeline')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [retailerId])

  if (loading) return <p className="text-sm text-gray-500">Loading timeline…</p>
  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (rows.length === 0) return <p className="text-sm text-gray-500">No auction data uploaded for this retailer.</p>

  // Build the list of unique months (columns) sorted ascending.
  const months = Array.from(new Set(rows.map(r => r.month))).sort()

  // Build the list of unique (slug, account_name, customer_id) rows (y-axis).
  type RowKey = { slug: string; account_name: string; customer_id: string }
  const rowKeys: RowKey[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const key = `${r.slug}::${r.account_name}::${r.customer_id}`
    if (!seen.has(key)) {
      seen.add(key)
      rowKeys.push({ slug: r.slug, account_name: r.account_name, customer_id: r.customer_id })
    }
  }

  // Sort rows: by slug, then by earliest month active
  const earliest = (rk: RowKey) => {
    const m = rows.filter(r => r.slug === rk.slug && r.account_name === rk.account_name && r.customer_id === rk.customer_id)
      .map(r => r.month).sort()[0] ?? ''
    return `${rk.slug}::${m}`
  }
  rowKeys.sort((a, b) => earliest(a).localeCompare(earliest(b)))

  // Index cells: key = "slug::account_name::customer_id::month"
  const cellIndex = new Map<string, TimelineRow>()
  for (const r of rows) {
    cellIndex.set(`${r.slug}::${r.account_name}::${r.customer_id}::${r.month}`, r)
  }

  // Detect months where multiple accounts are both preferred for the same slug.
  // key = "slug::month" → count of preferred rows
  const preferredCountPerSlotKey = new Map<string, number>()
  for (const r of rows) {
    if (r.is_preferred) {
      const k = `${r.slug}::${r.month}`
      preferredCountPerSlotKey.set(k, (preferredCountPerSlotKey.get(k) ?? 0) + 1)
    }
  }

  // Group row keys by slug for visual grouping
  const slugGroups: { slug: string; keys: RowKey[] }[] = []
  for (const rk of rowKeys) {
    const last = slugGroups[slugGroups.length - 1]
    if (last && last.slug === rk.slug) {
      last.keys.push(rk)
    } else {
      slugGroups.push({ slug: rk.slug, keys: [rk] })
    }
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {Object.entries(DATA_SOURCE_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm ${DATA_SOURCE_COLOUR[key] ?? 'bg-gray-300'}`} />
            <span className="text-xs text-gray-600">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="inline-block w-3 h-3 rounded-sm border-2 border-gray-500" />
          <span className="text-xs text-gray-600">Preferred for display</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm border-2 border-amber-500" />
          <span className="text-xs text-gray-600">Both preferred — re-import and select preferred account on the Assign step to fix</span>
        </div>
      </div>

      {/* Timeline grid */}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full min-w-max">
          {/* Month headers */}
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-gray-500 font-medium bg-gray-50 border border-gray-200 w-40">Slug</th>
              <th className="text-left px-3 py-2 text-gray-500 font-medium bg-gray-50 border border-gray-200 w-48">Account</th>
              {months.map(m => (
                <th key={m} className="px-2 py-2 text-gray-500 font-medium bg-gray-50 border border-gray-200 text-center whitespace-nowrap min-w-[72px]">
                  {m}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {slugGroups.map(({ slug, keys }) => (
              keys.map((rk, rowIdx) => (
                <tr key={`${rk.slug}::${rk.account_name}::${rk.customer_id}`} className="hover:bg-gray-50">
                  {/* Slug cell — spans all account rows for this slug */}
                  {rowIdx === 0 && (
                    <td
                      rowSpan={keys.length}
                      className="px-3 py-2 border border-gray-200 font-mono font-medium text-gray-900 align-top"
                    >
                      {slug}
                    </td>
                  )}

                  {/* Account name + customer ID */}
                  <td className="px-3 py-2 border border-gray-200 text-gray-700">
                    <div className="font-medium">{rk.account_name}</div>
                    <div className="text-gray-400 text-[10px]">{rk.customer_id}</div>
                  </td>

                  {/* Month cells */}
                  {months.map(month => {
                    const cell = cellIndex.get(`${rk.slug}::${rk.account_name}::${rk.customer_id}::${month}`)
                    if (!cell) {
                      return <td key={month} className="border border-gray-100 bg-white" />
                    }
                    const colour = DATA_SOURCE_COLOUR[cell.data_source] ?? 'bg-gray-300'
                    const preferredCount = preferredCountPerSlotKey.get(`${rk.slug}::${month}`) ?? 0
                    const isConflict = cell.is_preferred && preferredCount > 1
                    const ringClass = cell.is_preferred
                      ? isConflict
                        ? 'ring-2 ring-inset ring-amber-500'
                        : 'ring-2 ring-inset ring-gray-500'
                      : ''
                    const titleSuffix = isConflict
                      ? ' · ⚠ both accounts preferred — re-upload to fix'
                      : cell.is_preferred ? ' · preferred for display' : ''
                    return (
                      <td
                        key={month}
                        title={`${rk.account_name} · ${month} · ${DATA_SOURCE_LABEL[cell.data_source] ?? cell.data_source}${titleSuffix}`}
                        className={`border border-white ${ringClass}`}
                      >
                        <div className={`h-6 w-full ${colour} rounded-sm`} />
                      </td>
                    )
                  })}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Read-only view. Dark border = preferred data source for this retailer&apos;s auction display. Amber border = both accounts marked preferred (re-upload the CSV to correct).
      </p>
    </div>
  )
}
