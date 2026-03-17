'use client'

import { useEffect, useMemo, useState } from 'react'

type RetailerOption = {
  retailer_id: string
  retailer_name: string
}

type ClassificationOverride = {
  retailer_id: string
  retailer_name: string
  overlap_high_threshold: number | null
  impression_share_high_threshold: number | null
  is_active: boolean
  updated_at: string | null
}

type ClassificationResponse = {
  settings: {
    overlap_high_threshold: number
    impression_share_high_threshold: number
  }
  overrides: ClassificationOverride[]
  retailers: RetailerOption[]
}

const toPercent = (decimal: number | null | undefined): string => {
  if (decimal == null || Number.isNaN(decimal)) return ''
  return (decimal * 100).toFixed(1)
}

const toDecimal = (percent: string): number | null => {
  if (!percent.trim()) return null
  const parsed = Number.parseFloat(percent)
  if (!Number.isFinite(parsed)) return null
  const decimal = parsed / 100
  if (decimal < 0) return 0
  if (decimal > 1) return 1
  return decimal
}

export default function AuctionClassificationSettings() {
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingOverride, setSavingOverride] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [retailers, setRetailers] = useState<RetailerOption[]>([])
  const [overrides, setOverrides] = useState<ClassificationOverride[]>([])

  const [globalOverlapPct, setGlobalOverlapPct] = useState('50.0')
  const [globalSharePct, setGlobalSharePct] = useState('30.0')

  const [newRetailerId, setNewRetailerId] = useState('')
  const [newOverlapPct, setNewOverlapPct] = useState('')
  const [newSharePct, setNewSharePct] = useState('')

  const [recalcRetailerId, setRecalcRetailerId] = useState('')
  const [recalcStartedAt, setRecalcStartedAt] = useState<number | null>(null)
  const [recalcElapsedSeconds, setRecalcElapsedSeconds] = useState(0)
  const [recalcSummary, setRecalcSummary] = useState<{
    retailersUpdated: number
    monthsUpdated: number
  } | null>(null)

  const activeOverrides = useMemo(
    () => overrides.filter((override) => override.is_active),
    [overrides],
  )

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/auction-classification', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to load auction classification settings')
      }

      const payload = await response.json() as ClassificationResponse
      setRetailers(payload.retailers ?? [])
      setOverrides(payload.overrides ?? [])
      setGlobalOverlapPct(toPercent(payload.settings?.overlap_high_threshold ?? 0.5))
      setGlobalSharePct(toPercent(payload.settings?.impression_share_high_threshold ?? 0.3))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load auction classification settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!recalculating || recalcStartedAt == null) return

    const timer = window.setInterval(() => {
      setRecalcElapsedSeconds(Math.max(0, Math.floor((Date.now() - recalcStartedAt) / 1000)))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [recalculating, recalcStartedAt])

  useEffect(() => {
    if (!recalculating) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [recalculating])

  const saveGlobalSettings = async () => {
    const overlap = toDecimal(globalOverlapPct)
    const share = toDecimal(globalSharePct)
    if (overlap == null || share == null) {
      setError('Enter valid percentage thresholds for both overlap and impression share.')
      return
    }

    setSavingSettings(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch('/api/admin/auction-classification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          overlap_high_threshold: overlap,
          impression_share_high_threshold: share,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to save global settings')
      }
      setSuccessMessage('Global thresholds saved.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save global settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const addOrUpdateOverride = async () => {
    if (!newRetailerId) {
      setError('Choose a retailer before saving an override.')
      return
    }

    const overlap = toDecimal(newOverlapPct)
    const share = toDecimal(newSharePct)

    setSavingOverride(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch('/api/admin/auction-classification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          retailer_id: newRetailerId,
          overlap_high_threshold: overlap,
          impression_share_high_threshold: share,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to save override')
      }

      setSuccessMessage('Retailer override saved.')
      setNewRetailerId('')
      setNewOverlapPct('')
      setNewSharePct('')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save override')
    } finally {
      setSavingOverride(false)
    }
  }

  const removeOverride = async (retailerId: string) => {
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch(`/api/admin/auction-classification?retailer_id=${encodeURIComponent(retailerId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to remove override')
      }
      setSuccessMessage('Retailer override removed.')
      await load()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove override')
    }
  }

  const runRecalculation = async () => {
    setRecalculating(true)
    setRecalcStartedAt(Date.now())
    setRecalcElapsedSeconds(0)
    setRecalcSummary(null)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch('/api/admin/auction-classification/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          retailer_id: recalcRetailerId || undefined,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to recalculate classifications')
      }

      const payload = await response.json() as {
        rows_updated?: number
        retailers_updated?: number
        months_updated?: number
      }
      const retailersUpdated = Number(payload.retailers_updated ?? 0)
      const monthsUpdated = Number(payload.months_updated ?? 0)
      setRecalcSummary({ retailersUpdated, monthsUpdated })
      setSuccessMessage('Recalculation completed.')
    } catch (recalcError) {
      setError(recalcError instanceof Error ? recalcError.message : 'Failed to recalculate classifications')
    } finally {
      setRecalculating(false)
      setRecalcStartedAt(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Auction competitor classification</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure thresholds used to classify competitors into quadrant groups, then recalculate stored classifications when required.
        </p>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {successMessage && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</div>}

      {loading ? (
        <div className="text-sm text-gray-500">Loading classification settings…</div>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Global thresholds</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm text-gray-700">
                High overlap threshold (%)
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={globalOverlapPct}
                  onChange={(event) => setGlobalOverlapPct(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-700">
                High impression share threshold (%)
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={globalSharePct}
                  onChange={(event) => setGlobalSharePct(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveGlobalSettings}
                disabled={savingSettings}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingSettings ? 'Saving…' : 'Save global thresholds'}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Retailer overrides</h3>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 items-end">
              <label className="text-sm text-gray-700 lg:col-span-2">
                Retailer
                <select
                  value={newRetailerId}
                  onChange={(event) => setNewRetailerId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                >
                  <option value="">Select retailer</option>
                  {retailers.map((retailer) => (
                    <option key={retailer.retailer_id} value={retailer.retailer_id}>
                      {retailer.retailer_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-700">
                Overlap (%)
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={newOverlapPct}
                  onChange={(event) => setNewOverlapPct(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-700">
                Impression share (%)
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={newSharePct}
                  onChange={(event) => setNewSharePct(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addOrUpdateOverride}
                disabled={savingOverride}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {savingOverride ? 'Saving…' : 'Add or update override'}
              </button>
            </div>

            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Retailer</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Overlap threshold</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Impression share threshold</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeOverrides.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-center text-gray-500">No active overrides configured.</td>
                    </tr>
                  )}
                  {activeOverrides.map((override) => (
                    <tr key={override.retailer_id}>
                      <td className="px-3 py-2 text-gray-800">{override.retailer_name}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {override.overlap_high_threshold == null ? 'Global default' : `${toPercent(override.overlap_high_threshold)}%`}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {override.impression_share_high_threshold == null ? 'Global default' : `${toPercent(override.impression_share_high_threshold)}%`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeOverride(override.retailer_id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Recalculate classifications</h3>
            <p className="text-sm text-gray-500">
              Recomputes auction competitor quadrants for either all retailers or one selected retailer using the current settings and overrides.
            </p>
            {recalculating && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Recalculation in progress. Please keep this page open. Elapsed: {recalcElapsedSeconds}s.
              </div>
            )}
            {recalcSummary && !recalculating && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <p>Retailers updated: <span className="font-semibold">{recalcSummary.retailersUpdated}</span></p>
                <p>Months updated: <span className="font-semibold">{recalcSummary.monthsUpdated}</span></p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
              <label className="text-sm text-gray-700 md:col-span-2">
                Scope
                <select
                  value={recalcRetailerId}
                  onChange={(event) => setRecalcRetailerId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                >
                  <option value="">All retailers</option>
                  {retailers.map((retailer) => (
                    <option key={`recalc-${retailer.retailer_id}`} value={retailer.retailer_id}>
                      {retailer.retailer_name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={runRecalculation}
                disabled={recalculating}
                className="rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-60"
              >
                {recalculating ? 'Recalculating…' : 'Run recalculation'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
