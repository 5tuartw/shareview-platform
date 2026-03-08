'use client'

import { useEffect, useMemo, useState } from 'react'

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
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

const isActiveRetailer = (row: RetailerRow): boolean => {
  if (typeof row.is_active_retailer === 'boolean') return row.is_active_retailer

  const dataActive = (row.data_activity_status || '').toLowerCase() === 'active'
  const recentData = row.last_data_date
    ? Date.now() - new Date(row.last_data_date).getTime() <= NINETY_DAYS_MS
    : false

  return dataActive || recentData || row.is_enrolled === true
}

const formatDate = (value?: string | null): string => {
  if (!value) return 'No data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No data'
  return date.toLocaleDateString('en-GB')
}

export default function ManageRetailersDashboard() {
  const [retailers, setRetailers] = useState<RetailerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'enrolled' | 'active' | 'all'>('active')
  const [savingRetailerId, setSavingRetailerId] = useState<string | null>(null)
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

  const enrolledCount = useMemo(
    () => retailers.filter((row) => row.is_enrolled === true).length,
    [retailers]
  )
  const activeCount = useMemo(
    () => retailers.filter((row) => isActiveRetailer(row)).length,
    [retailers]
  )
  const allCount = retailers.length

  const filteredRetailers = useMemo(() => {
    const byFilter =
      filter === 'enrolled'
        ? retailers.filter((row) => row.is_enrolled === true)
        : filter === 'active'
          ? retailers.filter((row) => isActiveRetailer(row))
          : retailers

    const term = search.trim().toLowerCase()
    const bySearch = term
      ? byFilter.filter((row) =>
          `${row.retailer_name} ${row.retailer_id}`.toLowerCase().includes(term)
        )
      : byFilter

    return [...bySearch].sort((a, b) => a.retailer_name.localeCompare(b.retailer_name))
  }, [filter, retailers, search])

  const toggleEnrolment = async (row: RetailerRow) => {
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
            onClick={() => setFilter('enrolled')}
            className={`px-3 py-2 text-xs font-medium ${
              filter === 'enrolled' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            Enrolled ({enrolledCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`border-l border-gray-300 px-3 py-2 text-xs font-medium ${
              filter === 'active' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
            }`}
          >
            Active Retailers ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
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
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">Data Status</th>
              <th className="px-4 py-3 text-left font-medium">Last Data Date</th>
              <th className="px-4 py-3 text-left font-medium">Last Snapshot Update</th>
              <th className="px-4 py-3 text-left font-medium">Active</th>
              <th className="px-4 py-3 text-left font-medium">Enrolment</th>
            </tr>
          </thead>
          <tbody>
            {filteredRetailers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No retailers match this filter.
                </td>
              </tr>
            )}

            {filteredRetailers.map((row) => {
              const active = isActiveRetailer(row)
              const enrolled = row.is_enrolled === true
              const saving = savingRetailerId === row.retailer_id

              return (
                <tr key={row.retailer_id} className="border-t border-gray-200">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.retailer_name}</div>
                    <div className="text-xs text-gray-500">{row.retailer_id}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{[row.category, row.tier].filter(Boolean).join(' · ') || 'Not set'}</td>
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
                  <td className="px-4 py-3 text-gray-700">{formatDate(row.latest_data_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleEnrolment(row)}
                      disabled={saving}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                        enrolled
                          ? 'bg-gray-900 text-white hover:bg-gray-800'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      } disabled:opacity-50`}
                    >
                      {saving ? 'Saving...' : enrolled ? 'Unenrol' : 'Enrol'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
