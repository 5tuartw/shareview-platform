'use client'

import { useEffect, useMemo, useState } from 'react'
import { CircleAlert, CircleMinus, CirclePlus, Info, Star } from 'lucide-react'

type RetailerRow = {
  retailer_id: string
  retailer_name: string
  category?: string
  tier?: string
  data_activity_status?: string
  last_data_date?: string | null
  latest_data_at?: string | null
  is_enrolled?: boolean
  is_active_retailer?: boolean
  status?: string
  is_demo?: boolean
  high_priority?: boolean
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

const isActiveRetailer = (row: RetailerRow): boolean => {
  // Demo retailers should always appear inactive in staff views.
  if (row.is_demo === true) return false
  if (typeof row.is_active_retailer === 'boolean') return row.is_active_retailer

  const dataActive = (row.data_activity_status || '').toLowerCase() === 'active'
  const recentData = row.last_data_date
    ? Date.now() - new Date(row.last_data_date).getTime() <= NINETY_DAYS_MS
    : false

  return dataActive || recentData || row.is_enrolled === true
}

const isStarredRetailer = (row: RetailerRow): boolean => {
  if (row.is_demo === true) return true
  return row.high_priority === true
}

const formatDate = (value?: string | null): string => {
  if (!value) return 'No data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No data'
  return date.toLocaleDateString('en-GB')
}

const isActiv8DemoRetailer = (row: RetailerRow): boolean => {
  return row.is_demo === true && row.retailer_name.trim().toLowerCase() === 'activ8'
}

export default function ManageRetailersDashboard() {
  const [retailers, setRetailers] = useState<RetailerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'starred' | 'active' | 'all'>('starred')
  const [savingRetailerId, setSavingRetailerId] = useState<string | null>(null)
  const [confirmUnstarRow, setConfirmUnstarRow] = useState<RetailerRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRetailers = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/retailers')
      if (!response.ok) throw new Error('Failed to load retailers')
      const payload = (await response.json()) as RetailerRow[]
      setRetailers(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load retailers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRetailers()
  }, [])

  const starredCount = useMemo(
    () => retailers.filter((row) => isStarredRetailer(row)).length,
    [retailers]
  )
  const activeCount = useMemo(
    () => retailers.filter((row) => isActiveRetailer(row)).length,
    [retailers]
  )
  const allCount = retailers.length

  const filteredRetailers = useMemo(() => {
    const byFilter =
      filter === 'starred'
        ? retailers.filter((row) => isStarredRetailer(row))
        : filter === 'active'
          ? retailers.filter((row) => isActiveRetailer(row))
          : retailers

    const term = search.trim().toLowerCase()
    const bySearch = term
      ? byFilter.filter((row) =>
          row.retailer_name.toLowerCase().includes(term)
        )
      : byFilter

    return [...bySearch].sort((a, b) => {
      const ap = a.is_demo === true ? 0 : isStarredRetailer(a) ? 1 : 2
      const bp = b.is_demo === true ? 0 : isStarredRetailer(b) ? 1 : 2
      if (ap !== bp) return ap - bp
      return a.retailer_name.localeCompare(b.retailer_name)
    })
  }, [filter, retailers, search])

  const toggleEnrolment = async (row: RetailerRow) => {
    if (row.is_demo === true) return

    setSavingRetailerId(row.retailer_id)
    setError(null)

    try {
      const response = await fetch(`/api/admin/retailers/${row.retailer_id}/enrolment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enrolled: !(row.is_enrolled === true) }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to update enrolment')
      }

      await loadRetailers()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update enrolment')
    } finally {
      setSavingRetailerId(null)
    }
  }

  const setStarred = async (row: RetailerRow, isStarred: boolean) => {
    setSavingRetailerId(row.retailer_id)
    setError(null)

    try {
      const response = await fetch(`/api/admin/retailers/${row.retailer_id}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_starred: isStarred }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to update starred state')
      }

      await loadRetailers()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update starred state')
    } finally {
      setSavingRetailerId(null)
      setConfirmUnstarRow(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading retailers...</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Policy Settings</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-3">
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="font-medium text-gray-900">Auto-mark inactive threshold</div>
            <div>90 days without new source data</div>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="font-medium text-gray-900">Active logic</div>
            <div>Source active OR recent data OR enrolled</div>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="font-medium text-gray-900">Manual override</div>
            <div>Not enabled yet</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Current rule: Active means source data seen in the last 90 days, or explicitly enrolled.
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search retailers..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-96"
        />

        <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
          <button
            type="button"
            onClick={() => setFilter('starred')}
            title="Show starred retailers for prioritised monitoring"
            className={`px-3 py-2 text-xs font-medium ${
              filter === 'starred' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            Starred ({starredCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            title="Show all retailers with recent activity"
            className={`border-l border-gray-300 px-3 py-2 text-xs font-medium ${
              filter === 'active' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            Active Retailers ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            title="Show all retailers with data logged since January 2025"
            className={`border-l border-gray-300 px-3 py-2 text-xs font-medium ${
              filter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            All retailers ({allCount})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Retailer</th>
              <th className="px-4 py-3 text-left font-medium">Data Status</th>
              <th className="px-4 py-3 text-left font-medium">Last Data Date</th>
              <th className="px-4 py-3 text-left font-medium">Last Snapshot Update</th>
              <th className="px-4 py-3 text-left font-medium">Active</th>
              <th className="px-4 py-3 text-left font-medium">
                <span className="inline-flex items-center gap-1">
                  Enrolment
                  <span className="group relative inline-flex items-center">
                    <Info
                      className="h-3.5 w-3.5 text-gray-400"
                      aria-label="Enrolment help"
                      role="img"
                    />
                    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1.5 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      Use Enroll to force an inactive retailer to appear active, or Unenroll to stop fetching new data for that retailer.
                    </span>
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRetailers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No retailers match this filter.
                </td>
              </tr>
            )}

            {filteredRetailers.map((row) => {
              const active = isActiveRetailer(row)
              const enrolled = isActiv8DemoRetailer(row) ? true : row.is_enrolled === true
              const saving = savingRetailerId === row.retailer_id
              const enrolmentLocked = row.is_demo === true
              const lastSnapshotDisplay = isActiv8DemoRetailer(row)
                ? '28/02/2026'
                : formatDate(row.latest_data_at)

              return (
                <tr key={row.retailer_id} className="border-t border-gray-200">
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-2">
                      <div className="font-medium text-gray-900">{row.retailer_name}</div>
                      <button
                        type="button"
                        onClick={() => {
                          if (isStarredRetailer(row) && row.is_demo !== true) {
                            setConfirmUnstarRow(row)
                            return
                          }
                          if (row.is_demo !== true) {
                            void setStarred(row, true)
                          }
                        }}
                        disabled={saving || row.is_demo === true}
                        title={
                          row.is_demo === true
                            ? 'Demo retailers are always prioritised'
                            : isStarredRetailer(row)
                              ? 'Unstar retailer'
                              : 'Star retailer'
                        }
                        className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-50"
                      >
                        <Star
                          className={`h-4 w-4 ${isStarredRetailer(row) ? 'text-amber-500 fill-amber-500' : 'text-gray-400'}`}
                        />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      (row.data_activity_status || '').toLowerCase() === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {(row.data_activity_status || 'inactive').toLowerCase() === 'active' ? 'Source active' : 'Source inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(row.last_data_date)}</td>
                  <td className="px-4 py-3 text-gray-700">{lastSnapshotDisplay}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700">{enrolled ? 'Enrolled' : 'Not enrolled'}</span>
                      {!enrolmentLocked && (
                        <button
                          type="button"
                          onClick={() => toggleEnrolment(row)}
                          disabled={saving}
                          title={enrolled ? 'Unenrol retailer' : 'Enrol retailer'}
                          className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-50"
                        >
                          {enrolled ? (
                            <CircleMinus className="h-4 w-4 text-gray-700" />
                          ) : (
                            <CirclePlus className="h-4 w-4 text-gray-700" />
                          )}
                        </button>
                      )}
                      {enrolmentLocked && <span className="text-gray-400">(demo)</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {confirmUnstarRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmUnstarRow(null)} />
          <div className="relative w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Remove from Starred?</h3>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700">
              <p>
                {confirmUnstarRow.retailer_name} will be removed from Starred and deprioritised in staff filters.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                <CircleAlert className="h-3.5 w-3.5" />
                This does not change enrolment.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setConfirmUnstarRow(null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void setStarred(confirmUnstarRow, false)}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
              >
                Remove from Starred
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
