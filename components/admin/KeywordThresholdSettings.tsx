'use client'

import { useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group ml-1 inline-flex align-middle cursor-help">
      <Info className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
      <span className="invisible group-hover:visible absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-48 rounded bg-gray-800 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white text-left shadow-lg z-50 pointer-events-none">
        {text}
      </span>
    </span>
  )
}

type KeywordTier = {
  id: number
  tier_name: string
  display_order: number
  min_impressions: number
  min_clicks: number
  fallback_min_impressions: number
  fallback_min_clicks: number
  low_volume_trigger_qualified: number
  low_volume_trigger_positive: number
  is_default: boolean
}

type KeywordOverride = {
  retailer_id: string
  retailer_name: string
  tier_id: number | null
  tier_name: string | null
  custom_min_impressions: number | null
  custom_min_clicks: number | null
  custom_fallback_min_impressions: number | null
  custom_fallback_min_clicks: number | null
  is_active: boolean
  updated_at: string | null
}

type RetailerOption = { retailer_id: string; retailer_name: string }

export default function KeywordThresholdSettings() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [tiers, setTiers] = useState<KeywordTier[]>([])
  const [overrides, setOverrides] = useState<KeywordOverride[]>([])
  const [retailers, setRetailers] = useState<RetailerOption[]>([])

  // Tier editing
  const [editingTierId, setEditingTierId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<KeywordTier>>({})
  const [savingTier, setSavingTier] = useState(false)

  // New tier
  const [showNewTier, setShowNewTier] = useState(false)
  const [newTierForm, setNewTierForm] = useState({
    tier_name: '', min_impressions: '50', min_clicks: '5',
    fallback_min_impressions: '30', fallback_min_clicks: '3',
    low_volume_trigger_qualified: '30', low_volume_trigger_positive: '20',
  })
  const [savingNewTier, setSavingNewTier] = useState(false)

  // Override form
  const [newRetailerId, setNewRetailerId] = useState('')
  const [newOverrideTierId, setNewOverrideTierId] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)

  // Tier assessment
  type AssessmentResult = {
    retailer_id: string
    retailer_name: string
    avg_qualified_count: number
    avg_total_keywords: number
    months_used: number
    month_labels: string[]
    current_tier_name: string
    proposed_tier_id: number
    proposed_tier_name: string
    changed: boolean
    has_custom_values: boolean
  }
  type AssessmentSummary = {
    total: number
    changed: number
    unchanged: number
    custom_skipped: number
    tier_counts: { tier_name: string; count: number }[]
  }
  const [assessmentResults, setAssessmentResults] = useState<AssessmentResult[] | null>(null)
  const [assessmentSummary, setAssessmentSummary] = useState<AssessmentSummary | null>(null)
  const [assessmentMonths, setAssessmentMonths] = useState<string[]>([])
  const [assessmentLoading, setAssessmentLoading] = useState(false)
  const [assessmentApplying, setAssessmentApplying] = useState(false)
  const [assessmentApplied, setAssessmentApplied] = useState(false)

  // Regenerate snapshots
  const [regenRetailerId, setRegenRetailerId] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenStartedAt, setRegenStartedAt] = useState<number | null>(null)
  const [regenElapsedSeconds, setRegenElapsedSeconds] = useState(0)
  const [regenSummary, setRegenSummary] = useState<{
    retailersUpdated: number
    monthsUpdated: number
    snapshotsWritten: number
  } | null>(null)

  const activeOverrides = useMemo(
    () => overrides.filter((o) => o.is_active),
    [overrides],
  )

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/keyword-thresholds', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to load keyword threshold settings')
      }
      const payload = await response.json()
      setTiers(payload.tiers ?? [])
      setOverrides(payload.overrides ?? [])
      setRetailers(payload.retailers ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Elapsed timer for regeneration
  useEffect(() => {
    if (!regenerating || regenStartedAt == null) return
    const timer = window.setInterval(() => {
      setRegenElapsedSeconds(Math.max(0, Math.floor((Date.now() - regenStartedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [regenerating, regenStartedAt])

  // Warn before leaving during regeneration
  useEffect(() => {
    if (!regenerating) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [regenerating])

  const clearMessages = () => { setError(null); setSuccessMessage(null) }

  // --- Tier CRUD ---
  const startEditTier = (tier: KeywordTier) => {
    setEditingTierId(tier.id)
    setEditForm({ ...tier })
  }

  const cancelEditTier = () => {
    setEditingTierId(null)
    setEditForm({})
  }

  const saveTier = async () => {
    if (!editingTierId) return
    setSavingTier(true)
    clearMessages()
    try {
      const response = await fetch('/api/admin/keyword-thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: editingTierId, ...editForm }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to save tier')
      }
      const payload = await response.json()
      setTiers(payload.tiers ?? tiers)
      setEditingTierId(null)
      setEditForm({})
      setSuccessMessage('Tier updated.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save tier')
    } finally {
      setSavingTier(false)
    }
  }

  const createTier = async () => {
    const name = newTierForm.tier_name.trim()
    if (!name) { setError('Tier name is required'); return }
    setSavingNewTier(true)
    clearMessages()
    try {
      const response = await fetch('/api/admin/keyword-thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'create_tier',
          tier_name: name,
          min_impressions: Number(newTierForm.min_impressions) || 50,
          min_clicks: Number(newTierForm.min_clicks) || 5,
          fallback_min_impressions: Number(newTierForm.fallback_min_impressions) || 30,
          fallback_min_clicks: Number(newTierForm.fallback_min_clicks) || 3,
          low_volume_trigger_qualified: Number(newTierForm.low_volume_trigger_qualified) || 30,
          low_volume_trigger_positive: Number(newTierForm.low_volume_trigger_positive) || 20,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to create tier')
      }
      const payload = await response.json()
      setTiers(payload.tiers ?? tiers)
      setShowNewTier(false)
      setNewTierForm({
        tier_name: '', min_impressions: '50', min_clicks: '5',
        fallback_min_impressions: '30', fallback_min_clicks: '3',
        low_volume_trigger_qualified: '30', low_volume_trigger_positive: '20',
      })
      setSuccessMessage('Tier created.')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create tier')
    } finally {
      setSavingNewTier(false)
    }
  }

  const deleteTier = async (tierId: number) => {
    clearMessages()
    try {
      const response = await fetch(`/api/admin/keyword-thresholds?tier_id=${tierId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to delete tier')
      }
      const payload = await response.json()
      setTiers(payload.tiers ?? tiers)
      setSuccessMessage('Tier deleted.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete tier')
    }
  }

  const setDefaultTier = async (tierId: number) => {
    clearMessages()
    try {
      const response = await fetch('/api/admin/keyword-thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: tierId, is_default: true }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to set default')
      }
      const payload = await response.json()
      setTiers(payload.tiers ?? tiers)
      setSuccessMessage('Default tier updated.')
    } catch (defaultError) {
      setError(defaultError instanceof Error ? defaultError.message : 'Failed to set default')
    }
  }

  // --- Override CRUD ---
  const addOverride = async () => {
    if (!newRetailerId) { setError('Select a retailer'); return }
    if (!newOverrideTierId) { setError('Select a tier'); return }
    setSavingOverride(true)
    clearMessages()
    try {
      const response = await fetch('/api/admin/keyword-thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'upsert_override',
          retailer_id: newRetailerId,
          tier_id: Number(newOverrideTierId),
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to save override')
      }
      const payload = await response.json()
      setOverrides(payload.overrides ?? overrides)
      setNewRetailerId('')
      setNewOverrideTierId('')
      setSuccessMessage('Override saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save override')
    } finally {
      setSavingOverride(false)
    }
  }

  const removeOverride = async (retailerId: string) => {
    clearMessages()
    try {
      const response = await fetch(`/api/admin/keyword-thresholds?retailer_id=${encodeURIComponent(retailerId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to remove override')
      }
      const payload = await response.json()
      setOverrides(payload.overrides ?? overrides)
      setSuccessMessage('Override removed.')
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove override')
    }
  }

  // --- Tier Assessment ---
  const runAssessment = async () => {
    setAssessmentLoading(true)
    setAssessmentApplied(false)
    clearMessages()
    try {
      const response = await fetch('/api/admin/keyword-thresholds/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to run assessment')
      }
      const payload = await response.json()
      setAssessmentResults(payload.results ?? [])
      setAssessmentSummary(payload.summary ?? null)
      setAssessmentMonths(payload.months_analysed ?? [])
    } catch (assessError) {
      setError(assessError instanceof Error ? assessError.message : 'Failed to run assessment')
      setAssessmentResults(null)
    } finally {
      setAssessmentLoading(false)
    }
  }

  const applyAssessment = async () => {
    setAssessmentApplying(true)
    clearMessages()
    try {
      const response = await fetch('/api/admin/keyword-thresholds/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apply: true }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to apply assessment')
      }
      const payload = await response.json()
      setAssessmentApplied(true)
      setAssessmentResults(payload.results ?? [])
      setAssessmentSummary(payload.summary ?? null)
      setSuccessMessage(
        `Assessment applied: ${payload.applied ?? 0} retailer(s) updated` +
        (payload.skipped_custom ? `, ${payload.skipped_custom} skipped (custom overrides)` : '') +
        '.',
      )
      // Refresh overrides to reflect the changes
      await load()
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Failed to apply assessment')
    } finally {
      setAssessmentApplying(false)
    }
  }

  // --- Regenerate Snapshots ---
  const runRegeneration = async () => {
    setRegenerating(true)
    setRegenStartedAt(Date.now())
    setRegenElapsedSeconds(0)
    setRegenSummary(null)
    clearMessages()
    try {
      const response = await fetch('/api/admin/keyword-thresholds/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          retailer_id: regenRetailerId || undefined,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to regenerate snapshots')
      }
      const payload = await response.json() as {
        snapshots_written?: number
        retailers_updated?: number
        months_updated?: number
      }
      setRegenSummary({
        retailersUpdated: Number(payload.retailers_updated ?? 0),
        monthsUpdated: Number(payload.months_updated ?? 0),
        snapshotsWritten: Number(payload.snapshots_written ?? 0),
      })
      setSuccessMessage('Snapshot regeneration completed.')
    } catch (regenError) {
      setError(regenError instanceof Error ? regenError.message : 'Failed to regenerate snapshots')
    } finally {
      setRegenerating(false)
      setRegenStartedAt(null)
    }
  }

  const numInput = (
    value: string | number | undefined,
    onChange: (v: string) => void,
    placeholder?: string,
  ) => (
    <input
      type="number"
      min={0}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-center tabular-nums"
    />
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Search term qualification thresholds</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure minimum impressions and clicks required for search terms to qualify for quadrant analysis.
          Retailers without an override use the default tier.
        </p>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {successMessage && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</div>}

      {loading ? (
        <div className="text-sm text-gray-500">Loading threshold settings…</div>
      ) : (
        <>
          {/* Tiers Table */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Threshold Tiers</h3>
              <button
                type="button"
                onClick={() => setShowNewTier(!showNewTier)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                {showNewTier ? 'Cancel' : '+ Add tier'}
              </button>
            </div>

            {showNewTier && (
              <div className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <label className="text-xs text-gray-700 col-span-2 sm:col-span-4">
                    Tier name
                    <input
                      type="text"
                      value={newTierForm.tier_name}
                      onChange={(e) => setNewTierForm({ ...newTierForm, tier_name: e.target.value })}
                      className="mt-0.5 w-48 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      placeholder="e.g. Ultra-low"
                    />
                  </label>
                  <label className="text-xs text-gray-600">Min imp. {numInput(newTierForm.min_impressions, (v) => setNewTierForm({ ...newTierForm, min_impressions: v }))}</label>
                  <label className="text-xs text-gray-600">Min clicks {numInput(newTierForm.min_clicks, (v) => setNewTierForm({ ...newTierForm, min_clicks: v }))}</label>
                  <label className="text-xs text-gray-600">Fallback imp. {numInput(newTierForm.fallback_min_impressions, (v) => setNewTierForm({ ...newTierForm, fallback_min_impressions: v }))}</label>
                  <label className="text-xs text-gray-600">Fallback clicks {numInput(newTierForm.fallback_min_clicks, (v) => setNewTierForm({ ...newTierForm, fallback_min_clicks: v }))}</label>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={createTier} disabled={savingNewTier}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                    {savingNewTier ? 'Creating…' : 'Create tier'}
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto overflow-y-visible rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Tier</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Min imp.<InfoTip text="Minimum number of times a search term must appear in results before it counts as meaningful." /></th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Min clicks<InfoTip text="Minimum number of clicks a search term needs to be worth analysing." /></th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Fallback imp.<InfoTip text="Relaxed impressions threshold used when a retailer has very few qualifying terms." /></th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Fallback clicks<InfoTip text="Relaxed clicks threshold used when a retailer has very few qualifying terms." /></th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Trigger (qual.)<InfoTip text="If fewer than this many terms qualify, the system switches to the relaxed fallback thresholds." /></th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Trigger (pos.)<InfoTip text="If fewer than this many terms have conversions, the system switches to the relaxed fallback thresholds." /></th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tiers.map((tier) => {
                    const isEditing = editingTierId === tier.id
                    return (
                      <tr key={tier.id} className={tier.is_default ? 'bg-emerald-50/50' : ''}>
                        <td className="px-3 py-2 text-gray-800">
                          {isEditing ? (
                            <input type="text" value={editForm.tier_name ?? ''} onChange={(e) => setEditForm({ ...editForm, tier_name: e.target.value })}
                              className="w-28 rounded border border-gray-300 px-1.5 py-1 text-sm" />
                          ) : (
                            <span className="font-medium">{tier.tier_name}</span>
                          )}
                          {tier.is_default && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 uppercase">Default</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditing ? numInput(editForm.min_impressions, (v) => setEditForm({ ...editForm, min_impressions: Number(v) })) : <span className="tabular-nums">{tier.min_impressions}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditing ? numInput(editForm.min_clicks, (v) => setEditForm({ ...editForm, min_clicks: Number(v) })) : <span className="tabular-nums">{tier.min_clicks}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditing ? numInput(editForm.fallback_min_impressions, (v) => setEditForm({ ...editForm, fallback_min_impressions: Number(v) })) : <span className="tabular-nums">{tier.fallback_min_impressions}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditing ? numInput(editForm.fallback_min_clicks, (v) => setEditForm({ ...editForm, fallback_min_clicks: Number(v) })) : <span className="tabular-nums">{tier.fallback_min_clicks}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditing ? numInput(editForm.low_volume_trigger_qualified, (v) => setEditForm({ ...editForm, low_volume_trigger_qualified: Number(v) })) : <span className="tabular-nums">{tier.low_volume_trigger_qualified}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditing ? numInput(editForm.low_volume_trigger_positive, (v) => setEditForm({ ...editForm, low_volume_trigger_positive: Number(v) })) : <span className="tabular-nums">{tier.low_volume_trigger_positive}</span>}
                        </td>
                        <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                          {isEditing ? (
                            <>
                              <button type="button" onClick={saveTier} disabled={savingTier}
                                className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
                                {savingTier ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" onClick={cancelEditTier}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => startEditTier(tier)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                                Edit
                              </button>
                              {!tier.is_default && (
                                <>
                                  <button type="button" onClick={() => setDefaultTier(tier.id)}
                                    className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                                    Set default
                                  </button>
                                  <button type="button" onClick={() => deleteTier(tier.id)}
                                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                                    Delete
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Regenerate Snapshots */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Regenerate Snapshots</h3>
            <p className="text-xs text-gray-500">
              Re-run keyword snapshot generation using current tier thresholds. This queries the source database and may take several minutes.
            </p>
            {regenerating && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                In progress… {regenElapsedSeconds}s
              </div>
            )}
            {regenSummary && !regenerating && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                {regenSummary.snapshotsWritten} snapshot(s) written across {regenSummary.retailersUpdated} retailer(s), {regenSummary.monthsUpdated} month(s).
              </div>
            )}
            <div className="flex gap-2 items-end">
              <select
                value={regenRetailerId}
                onChange={(e) => setRegenRetailerId(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All retailers</option>
                {retailers.map((r) => (
                  <option key={`regen-${r.retailer_id}`} value={r.retailer_id}>
                    {r.retailer_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={runRegeneration}
                disabled={regenerating}
                className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-60"
              >
                {regenerating ? 'Running…' : 'Regenerate'}
              </button>
            </div>
          </div>

          {/* Tier Assessment */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Tier Assessment</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Analyse recent snapshot data to recommend tier assignments based on each retailer&apos;s search term volume.
                  Uses the last 1–3 complete months (excluding December).
                </p>
              </div>
              <button
                type="button"
                onClick={runAssessment}
                disabled={assessmentLoading}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {assessmentLoading ? 'Analysing…' : 'Run Assessment'}
              </button>
            </div>

            {assessmentResults !== null && assessmentResults.length === 0 && (
              <div className="text-sm text-gray-500">No snapshot data available for assessment.</div>
            )}

            {assessmentResults !== null && assessmentResults.length > 0 && assessmentSummary && (
              <div className="space-y-3">
                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span>Months analysed: <strong>{assessmentMonths.join(', ')}</strong></span>
                  <span className="text-gray-300">|</span>
                  <span>{assessmentSummary.total} retailer{assessmentSummary.total !== 1 ? 's' : ''}</span>
                  <span className="text-gray-300">|</span>
                  {assessmentSummary.tier_counts.map((tc) => (
                    <span key={tc.tier_name}>
                      {tc.tier_name}: <strong>{tc.count}</strong>
                    </span>
                  ))}
                  <span className="text-gray-300">|</span>
                  <span className={assessmentSummary.changed > 0 ? 'text-amber-700 font-medium' : 'text-gray-500'}>
                    {assessmentSummary.changed} change{assessmentSummary.changed !== 1 ? 's' : ''}
                  </span>
                  {assessmentSummary.custom_skipped > 0 && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-500">{assessmentSummary.custom_skipped} with custom overrides (skipped)</span>
                    </>
                  )}
                </div>

                {/* Results table */}
                <div className="overflow-x-auto rounded-md border border-gray-200 max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Retailer</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">Avg qualified<InfoTip text="Average number of search terms meeting the qualification thresholds, over the months analysed." /></th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">Avg total<InfoTip text="Average total unique search terms for this retailer (before qualification filtering)." /></th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">Months</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Current tier</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Proposed tier</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {assessmentResults.map((r) => (
                        <tr key={r.retailer_id} className={r.changed ? 'bg-amber-50/50' : ''}>
                          <td className="px-3 py-1.5 text-gray-800 whitespace-nowrap">{r.retailer_name}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums">{r.avg_qualified_count}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-gray-500">{r.avg_total_keywords.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-gray-500">{r.months_used}</td>
                          <td className="px-3 py-1.5 text-gray-700">{r.current_tier_name}</td>
                          <td className="px-3 py-1.5">
                            <span className={r.changed ? 'font-medium text-amber-800' : 'text-gray-700'}>
                              {r.proposed_tier_name}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {r.has_custom_values ? (
                              <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">Custom</span>
                            ) : r.changed ? (
                              <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 uppercase">Change</span>
                            ) : (
                              <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 uppercase">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Apply button */}
                {assessmentSummary.changed > 0 && !assessmentApplied && (
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-xs text-gray-500">
                      This will update {assessmentSummary.changed - assessmentSummary.custom_skipped} retailer tier assignment{(assessmentSummary.changed - assessmentSummary.custom_skipped) !== 1 ? 's' : ''}.
                      {assessmentSummary.custom_skipped > 0 && ` ${assessmentSummary.custom_skipped} with custom values will be skipped.`}
                    </span>
                    <button
                      type="button"
                      onClick={applyAssessment}
                      disabled={assessmentApplying}
                      className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {assessmentApplying ? 'Applying…' : 'Apply Recommendations'}
                    </button>
                  </div>
                )}
                {assessmentApplied && (
                  <div className="text-xs text-emerald-700 text-right">Tier assignments applied successfully.</div>
                )}
              </div>
            )}
          </div>

          {/* Retailer Overrides */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Retailer overrides</h3>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm text-gray-700">
                Retailer
                <select value={newRetailerId} onChange={(e) => setNewRetailerId(e.target.value)}
                  className="mt-0.5 block w-52 rounded border border-gray-300 px-2 py-1.5 text-sm">
                  <option value="">Select retailer</option>
                  {retailers.map((r) => (
                    <option key={r.retailer_id} value={r.retailer_id}>{r.retailer_name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-700">
                Tier
                <select value={newOverrideTierId} onChange={(e) => setNewOverrideTierId(e.target.value)}
                  className="mt-0.5 block w-36 rounded border border-gray-300 px-2 py-1.5 text-sm">
                  <option value="">Select tier</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>{t.tier_name}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={addOverride} disabled={savingOverride}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                {savingOverride ? 'Saving…' : 'Add override'}
              </button>
            </div>

            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Retailer</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Assigned tier</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeOverrides.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-3 text-center text-gray-500">No overrides. All retailers use the default tier.</td></tr>
                  )}
                  {activeOverrides.map((o) => (
                    <tr key={o.retailer_id}>
                      <td className="px-3 py-2 text-gray-800">{o.retailer_name}</td>
                      <td className="px-3 py-2 text-gray-700">{o.tier_name ?? 'Custom'}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => removeOverride(o.retailer_id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
