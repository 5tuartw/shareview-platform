'use client'

import { useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'

type SettingsState = {
  allow_ai_assigned_profile_values: boolean
}

type SettingsResponse = {
  settings: SettingsState
  defaults: SettingsState
}

export default function SuperAdminGeneralSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<SettingsState | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/market-comparison-settings', {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to load settings.')
      }

      const payload = (await response.json()) as SettingsResponse
      setSettings(payload.settings)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    if (!settings) return

    setSaving(true)
    setError(null)
    setSaved(null)

    try {
      const response = await fetch('/api/admin/market-comparison-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to save settings.')
      }

      const payload = (await response.json()) as SettingsResponse
      setSettings(payload.settings)
      setSaved('General settings saved.')
      setTimeout(() => setSaved(null), 3000)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-500">Loading general settings...</p>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-6">
        <p className="text-sm text-red-700">General settings are unavailable.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-[#F59E0B]" />
        <h3 className="text-lg font-semibold text-gray-900">General Settings</h3>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saved}
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <label className="inline-flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={settings.allow_ai_assigned_profile_values}
            onChange={(event) => setSettings((current) => current
              ? { ...current, allow_ai_assigned_profile_values: event.target.checked }
              : current)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Allow Market Comparisons to use AI-assigned profile values</span>
            <span className="block mt-1 text-xs text-slate-600">
              When enabled, both approved and AI-assigned profiles are included in market-comparison cohorts.
              When disabled, only approved profiles are used.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1C1D1C] text-white text-sm font-semibold hover:bg-black disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save general settings'}
        </button>
      </div>
    </div>
  )
}
