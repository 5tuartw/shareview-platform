'use client'

import { useEffect, useState } from 'react'
import { AtSign, Check, Info, Loader2, Plus, Trash2, X } from 'lucide-react'

type RetailerAliasType = 'manual' | 'display_name' | 'search_term' | 'typo' | 'legacy' | 'provider_specific'

type RetailerAliasRow = {
  retailer_alias_id: number
  retailer_id: string
  alias_name: string
  alias_name_normalized: string
  alias_type: RetailerAliasType
  source: string
  confidence: number | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type EditableRetailerAliasRow = RetailerAliasRow & {
  draft_alias_name: string
  draft_alias_type: Exclude<RetailerAliasType, 'manual'>
  draft_is_active: boolean
}

type CreateRetailerAliasForm = {
  alias_name: string
  alias_type: Exclude<RetailerAliasType, 'manual'>
  is_active: boolean
}

type Props = {
  isOpen: boolean
  retailerId: string | null
  retailerName: string | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}

const RETAILER_ALIAS_TYPE_OPTIONS: Array<{ value: Exclude<RetailerAliasType, 'manual'>; label: string }> = [
  { value: 'display_name', label: 'Display Name' },
  { value: 'search_term', label: 'Common Search Term' },
  { value: 'typo', label: 'Typo' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'provider_specific', label: 'Provider Specified' },
]

const EMPTY_CREATE_FORM: CreateRetailerAliasForm = {
  alias_name: '',
  alias_type: 'display_name',
  is_active: true,
}

const TooltipInfo = ({ label }: { label: string }) => (
  <span className="group relative inline-flex items-center align-middle">
    <Info className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1.5 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {label}
    </span>
  </span>
)

const toUiAliasType = (aliasType: RetailerAliasType): Exclude<RetailerAliasType, 'manual'> => {
  if (aliasType === 'manual') {
    return 'display_name'
  }

  return aliasType
}

const toEditableRow = (row: RetailerAliasRow): EditableRetailerAliasRow => ({
  ...row,
  draft_alias_name: row.alias_name,
  draft_alias_type: toUiAliasType(row.alias_type),
  draft_is_active: row.is_active,
})

const formatConfidence = (value: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '1.00'
  }

  return value.toFixed(2)
}

export default function RetailerAliasesModal({
  isOpen,
  retailerId,
  retailerName,
  onClose,
  onSaved,
}: Props) {
  const [aliases, setAliases] = useState<EditableRetailerAliasRow[]>([])
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateRetailerAliasForm>(EMPTY_CREATE_FORM)

  const loadAliases = async () => {
    if (!retailerId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/retailers/${retailerId}/aliases`)
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to load retailer aliases')
      }

      const payload = (await response.json()) as { aliases: RetailerAliasRow[] }
      setAliases(payload.aliases.map(toEditableRow))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load retailer aliases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !retailerId) {
      return
    }

    void loadAliases()
    setCreateForm(EMPTY_CREATE_FORM)
  }, [isOpen, retailerId])

  if (!isOpen || !retailerId || !retailerName) {
    return null
  }

  const refreshAll = async () => {
    await Promise.resolve(onSaved())
    await loadAliases()
  }

  const updateAliasDraft = (
    aliasId: number,
    field: keyof EditableRetailerAliasRow,
    value: string | boolean,
  ) => {
    setAliases((current) => current.map((row) => (
      row.retailer_alias_id === aliasId
        ? { ...row, [field]: value }
        : row
    )))
  }

  const saveAlias = async (row: EditableRetailerAliasRow) => {
    try {
      setSavingKey(`save:${row.retailer_alias_id}`)
      setError(null)

      const response = await fetch(`/api/admin/retailers/${retailerId}/aliases/${row.retailer_alias_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias_name: row.draft_alias_name.trim(),
          alias_type: row.draft_alias_type,
          confidence: 1,
          is_active: row.draft_is_active,
          notes: null,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to save retailer alias')
      }

      await refreshAll()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save retailer alias')
    } finally {
      setSavingKey(null)
    }
  }

  const deleteAlias = async (row: EditableRetailerAliasRow) => {
    const confirmed = window.confirm(`Delete alias ${row.alias_name} from ${retailerName}?`)
    if (!confirmed) {
      return
    }

    try {
      setSavingKey(`delete:${row.retailer_alias_id}`)
      setError(null)

      const response = await fetch(`/api/admin/retailers/${retailerId}/aliases/${row.retailer_alias_id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to delete retailer alias')
      }

      await refreshAll()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete retailer alias')
    } finally {
      setSavingKey(null)
    }
  }

  const createAlias = async () => {
    try {
      setSavingKey('create')
      setError(null)

      const aliasName = createForm.alias_name.trim()
      if (!aliasName) {
        throw new Error('Alias is required.')
      }

      const response = await fetch(`/api/admin/retailers/${retailerId}/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias_name: aliasName,
          alias_type: createForm.alias_type,
          confidence: 1,
          is_active: createForm.is_active,
          notes: null,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to create retailer alias')
      }

      setCreateForm(EMPTY_CREATE_FORM)
      await refreshAll()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create retailer alias')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Retailer aliases</p>
            <h3 className="mt-1 text-2xl font-semibold text-gray-900">{retailerName}</h3>
            <p className="mt-1 text-sm text-gray-600">Add alternative names your team may see in search, feeds, or historic data.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close retailer aliases modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-76px)] space-y-5 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Use retailer aliases for display variants, common search terms, typos, legacy names, and provider-specified naming.
          </div>

          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Additional aliases are not required for variants with different case, punctuation, spacing or accents. Example: the alias 'boots' covers variants such as Boots, BOOTS, boot's, b oots, boôts.
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Plus className="h-4 w-4" />
              Add retailer alias
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_170px_130px_auto]">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Alias</label>
                <input
                  type="text"
                  value={createForm.alias_name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, alias_name: event.target.value }))}
                  placeholder="Alias"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="mb-1 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Type
                  <TooltipInfo label="Optionally select an alternative type for this alias" />
                </div>
                <select
                  value={createForm.alias_type}
                  onChange={(event) => setCreateForm((current) => ({ ...current, alias_type: event.target.value as Exclude<RetailerAliasType, 'manual'> }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {RETAILER_ALIAS_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Status</label>
                <label className="inline-flex w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={createForm.is_active}
                    onChange={(event) => setCreateForm((current) => ({ ...current, is_active: event.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void createAlias()}
                  disabled={savingKey === 'create'}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingKey === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                <AtSign className="h-4 w-4" />
                Existing aliases
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
            </div>

            {loading ? (
              <div className="px-4 py-8 text-sm text-gray-500">Loading retailer aliases...</div>
            ) : aliases.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">No retailer aliases recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="w-[42%] px-4 py-3 text-left font-medium">Alias</th>
                      <th className="w-[22%] px-4 py-3 text-left font-medium">
                        <span className="inline-flex items-center gap-1">
                          Type
                          <TooltipInfo label="Optionally select an alternative type for this alias" />
                        </span>
                      </th>
                      <th className="w-[10%] px-4 py-3 text-left font-medium">
                        <span className="inline-flex items-center gap-1">
                          Confidence
                          <TooltipInfo label="Used when an alias has been derived by the software or AI" />
                        </span>
                      </th>
                      <th className="w-[12%] px-4 py-3 text-left font-medium">Status</th>
                      <th className="w-[14%] px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aliases.map((row) => {
                      const saveKey = `save:${row.retailer_alias_id}`
                      const deleteKey = `delete:${row.retailer_alias_id}`
                      const busy = savingKey === saveKey || savingKey === deleteKey

                      return (
                        <tr key={row.retailer_alias_id} className="border-t border-gray-200 align-top">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={row.draft_alias_name}
                              onChange={(event) => updateAliasDraft(row.retailer_alias_id, 'draft_alias_name', event.target.value)}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={row.draft_alias_type}
                              onChange={(event) => updateAliasDraft(row.retailer_alias_id, 'draft_alias_type', event.target.value as Exclude<RetailerAliasType, 'manual'>)}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            >
                              {RETAILER_ALIAS_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatConfidence(row.confidence)}</td>
                          <td className="px-4 py-3">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={row.draft_is_active}
                                onChange={(event) => updateAliasDraft(row.retailer_alias_id, 'draft_is_active', event.target.checked)}
                              />
                              {row.draft_is_active ? 'Active' : 'Inactive'}
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void saveAlias(row)}
                                disabled={busy}
                                className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                title="Save alias"
                                aria-label={`Save alias ${row.alias_name}`}
                              >
                                {savingKey === saveKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteAlias(row)}
                                disabled={busy}
                                className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                title="Delete alias"
                                aria-label={`Delete alias ${row.alias_name}`}
                              >
                                {savingKey === deleteKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}