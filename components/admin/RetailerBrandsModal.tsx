'use client'

import { Fragment, useEffect, useState } from 'react'
import { AtSign, Check, Info, Loader2, Plus, Tags, Trash2, X } from 'lucide-react'

type BrandRelationshipType = '3rd_party' | 'retailer_exclusive' | 'retailer_owned'

type BrandRow = {
  brand_id: number
  canonical_name: string
  slug: string
  brand_type: BrandRelationshipType
  brand_type_retailer_id: string | null
  brand_type_retailer_name: string | null
  relationship_type: BrandRelationshipType
  source: string
  source_alias_name: string | null
  latest_doc_count: number | null
  first_seen_at: string | null
  last_seen_at: string | null
  is_current: boolean
}

type EditableBrandRow = BrandRow & {
  draft_canonical_name: string
  draft_brand_type: BrandRelationshipType
  draft_brand_type_retailer_id: string
  draft_is_current: boolean
}

type CreateBrandForm = {
  canonical_name: string
  brand_type: BrandRelationshipType
  brand_type_retailer_id: string
  is_current: boolean
}

type RetailerOption = {
  retailer_id: string
  retailer_name: string
}

type BrandAliasRow = {
  brand_alias_id: number
  brand_id: number
  alias_name: string
  alias_name_normalized: string
  source: string
  confidence: number | null
  created_at: string
  updated_at: string
}

type EditableBrandAliasRow = BrandAliasRow & {
  draft_alias_name: string
}

type CreateBrandAliasForm = {
  alias_name: string
}

type BrandAliasContext = {
  brandId: number
  canonicalName: string
  rowKey: string
}

type Props = {
  isOpen: boolean
  retailerId: string | null
  retailerName: string | null
  retailerOptions: RetailerOption[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}

const EMPTY_CREATE_FORM: CreateBrandForm = {
  canonical_name: '',
  brand_type: '3rd_party',
  brand_type_retailer_id: '',
  is_current: true,
}

const EMPTY_BRAND_ALIAS_FORM: CreateBrandAliasForm = {
  alias_name: '',
}

const BRAND_TYPE_OPTIONS: Array<{ value: BrandRelationshipType; label: string }> = [
  { value: '3rd_party', label: '3rd Party' },
  { value: 'retailer_exclusive', label: 'Retailer Exclusive' },
  { value: 'retailer_owned', label: 'Retailer Owned' },
]

const TooltipInfo = ({ label }: { label: string }) => (
  <span className="group relative inline-flex items-center align-middle">
    <Info className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1.5 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {label}
    </span>
  </span>
)

const formatDate = (value: string | null): string => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-GB')
}

const formatConfidence = (value: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '1.00'
  }

  return value.toFixed(2)
}

const toEditableRow = (row: BrandRow): EditableBrandRow => ({
  ...row,
  draft_canonical_name: row.canonical_name,
  draft_brand_type: row.brand_type,
  draft_brand_type_retailer_id: row.brand_type_retailer_id ?? '',
  draft_is_current: row.is_current,
})

const toEditableBrandAliasRow = (row: BrandAliasRow): EditableBrandAliasRow => ({
  ...row,
  draft_alias_name: row.alias_name,
})

const getBrandRelationshipPillClass = (relationshipType: BrandRelationshipType): string => {
  if (relationshipType === 'retailer_owned') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (relationshipType === 'retailer_exclusive') {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-gray-100 text-gray-700'
}

const getBrandRelationshipLabel = (relationshipType: BrandRelationshipType): string => {
  if (relationshipType === 'retailer_owned') {
    return 'Owned'
  }

  if (relationshipType === 'retailer_exclusive') {
    return 'Exclusive'
  }

  return '3rd Party'
}

export default function RetailerBrandsModal({
  isOpen,
  retailerId,
  retailerName,
  retailerOptions,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brands, setBrands] = useState<EditableBrandRow[]>([])
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateBrandForm>(EMPTY_CREATE_FORM)
  const [brandAliases, setBrandAliases] = useState<EditableBrandAliasRow[]>([])
  const [brandAliasContext, setBrandAliasContext] = useState<BrandAliasContext | null>(null)
  const [brandAliasLoading, setBrandAliasLoading] = useState(false)
  const [brandAliasCreateForm, setBrandAliasCreateForm] = useState<CreateBrandAliasForm>(EMPTY_BRAND_ALIAS_FORM)

  const loadBrands = async () => {
    if (!retailerId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/retailers/${retailerId}/brands?limit=200&currentOnly=false`)
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to load retailer brands')
      }

      const payload = (await response.json()) as { brands: BrandRow[] }
      setBrands(payload.brands.map(toEditableRow))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load retailer brands')
    } finally {
      setLoading(false)
    }
  }

  const loadBrandAliases = async (brandId: number, rowKey: string) => {
    setBrandAliasLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/brands/${brandId}/aliases`)
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to load brand aliases')
      }

      const payload = (await response.json()) as {
        brand_id: number
        canonical_name: string
        aliases: BrandAliasRow[]
      }

      setBrandAliasContext({ brandId: payload.brand_id, canonicalName: payload.canonical_name, rowKey })
      setBrandAliases(payload.aliases.map(toEditableBrandAliasRow))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load brand aliases')
    } finally {
      setBrandAliasLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !retailerId) {
      return
    }

    void loadBrands()
    setCreateForm({ ...EMPTY_CREATE_FORM, brand_type_retailer_id: retailerId })
    setBrandAliasContext(null)
    setBrandAliases([])
    setBrandAliasCreateForm(EMPTY_BRAND_ALIAS_FORM)
  }, [isOpen, retailerId])

  if (!isOpen || !retailerId || !retailerName) {
    return null
  }

  const refreshAll = async () => {
    await Promise.resolve(onSaved())
    await loadBrands()
    if (brandAliasContext) {
      await loadBrandAliases(brandAliasContext.brandId, brandAliasContext.rowKey)
    }
  }

  const updateBrandDraft = (
    brandId: number,
    source: string,
    field: keyof EditableBrandRow,
    value: string | boolean,
  ) => {
    setBrands((current) =>
      current.map((row) => {
        if (row.brand_id !== brandId || row.source !== source) {
          return row
        }

        return {
          ...row,
          [field]: value,
        }
      })
    )
  }

  const updateBrandAliasDraft = (
    brandAliasId: number,
    field: keyof EditableBrandAliasRow,
    value: string,
  ) => {
    setBrandAliases((current) => current.map((row) => (
      row.brand_alias_id === brandAliasId
        ? { ...row, [field]: value }
        : row
    )))
  }

  const saveBrand = async (row: EditableBrandRow) => {
    try {
      setSavingKey(`${row.brand_id}:${row.source}:save`)
      setError(null)

      const response = await fetch(
        `/api/admin/retailers/${retailerId}/brands/${row.brand_id}?source=${encodeURIComponent(row.source)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canonical_name: row.draft_canonical_name.trim(),
            brand_type: row.draft_brand_type,
            brand_type_retailer_id: row.draft_brand_type === '3rd_party'
              ? null
              : row.draft_brand_type_retailer_id || retailerId,
            source_alias_name: row.source_alias_name,
            latest_doc_count: row.latest_doc_count,
            is_current: row.draft_is_current,
          }),
        }
      )

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to save brand')
      }

      await refreshAll()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save brand')
    } finally {
      setSavingKey(null)
    }
  }

  const deleteBrand = async (row: EditableBrandRow) => {
    const confirmed = window.confirm(
      `Delete ${row.canonical_name} from ${retailerName}? This removes the brand link for this retailer.`
    )

    if (!confirmed) {
      return
    }

    try {
      setSavingKey(`${row.brand_id}:${row.source}:delete`)
      setError(null)

      const response = await fetch(
        `/api/admin/retailers/${retailerId}/brands/${row.brand_id}?source=${encodeURIComponent(row.source)}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to delete brand')
      }

      await refreshAll()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete brand')
    } finally {
      setSavingKey(null)
    }
  }

  const createBrand = async () => {
    try {
      setSavingKey('create')
      setError(null)

      const canonicalName = createForm.canonical_name.trim()
      if (!canonicalName) {
        throw new Error('Official/Primary name is required.')
      }

      const response = await fetch(`/api/admin/retailers/${retailerId}/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_name: canonicalName,
          brand_type: createForm.brand_type,
          brand_type_retailer_id: createForm.brand_type === '3rd_party'
            ? null
            : createForm.brand_type_retailer_id || retailerId,
          source_alias_name: null,
          latest_doc_count: null,
          is_current: createForm.is_current,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to create brand')
      }

      setCreateForm({ ...EMPTY_CREATE_FORM, brand_type_retailer_id: retailerId })
      await refreshAll()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create brand')
    } finally {
      setSavingKey(null)
    }
  }

  const toggleBrandAliases = async (row: EditableBrandRow) => {
    const rowKey = `${row.brand_id}:${row.source}`

    if (brandAliasContext?.rowKey === rowKey) {
      setBrandAliasContext(null)
      setBrandAliases([])
      setBrandAliasCreateForm(EMPTY_BRAND_ALIAS_FORM)
      return
    }

    setBrandAliasCreateForm(EMPTY_BRAND_ALIAS_FORM)
    await loadBrandAliases(row.brand_id, rowKey)
  }

  const saveBrandAlias = async (row: EditableBrandAliasRow) => {
    if (!brandAliasContext) {
      return
    }

    try {
      setSavingKey(`alias-save:${row.brand_alias_id}`)
      setError(null)

      const response = await fetch(`/api/admin/brands/${brandAliasContext.brandId}/aliases/${row.brand_alias_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias_name: row.draft_alias_name.trim(),
          confidence: 1,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to save brand alias')
      }

      await loadBrandAliases(brandAliasContext.brandId, brandAliasContext.rowKey)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save brand alias')
    } finally {
      setSavingKey(null)
    }
  }

  const deleteBrandAlias = async (row: EditableBrandAliasRow) => {
    if (!brandAliasContext) {
      return
    }

    const confirmed = window.confirm(`Delete alias ${row.alias_name} from ${brandAliasContext.canonicalName}?`)
    if (!confirmed) {
      return
    }

    try {
      setSavingKey(`alias-delete:${row.brand_alias_id}`)
      setError(null)

      const response = await fetch(`/api/admin/brands/${brandAliasContext.brandId}/aliases/${row.brand_alias_id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to delete brand alias')
      }

      await loadBrandAliases(brandAliasContext.brandId, brandAliasContext.rowKey)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete brand alias')
    } finally {
      setSavingKey(null)
    }
  }

  const createBrandAlias = async () => {
    if (!brandAliasContext) {
      return
    }

    try {
      setSavingKey('alias-create')
      setError(null)

      const aliasName = brandAliasCreateForm.alias_name.trim()
      if (!aliasName) {
        throw new Error('Alias is required.')
      }

      const response = await fetch(`/api/admin/brands/${brandAliasContext.brandId}/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias_name: aliasName,
          confidence: 1,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to create brand alias')
      }

      setBrandAliasCreateForm(EMPTY_BRAND_ALIAS_FORM)
      await loadBrandAliases(brandAliasContext.brandId, brandAliasContext.rowKey)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create brand alias')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Retailer brands</p>
            <h3 className="mt-1 text-2xl font-semibold text-gray-900">{retailerName}</h3>
            <p className="mt-1 text-sm text-gray-600">Keep the primary brand names tidy for this retailer and add aliases only when the wording is genuinely different.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close retailer brands modal"
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
            Use this view to keep brand naming clear for the sales team. Product count and last seen come from the latest scan and are shown for context only.
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Plus className="h-4 w-4" />
              Link a new brand to this retailer
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px_130px_auto]">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Official/Primary name</label>
                <input
                  type="text"
                  value={createForm.canonical_name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, canonical_name: event.target.value }))}
                  placeholder="Official/Primary name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Brand relationship</label>
                <select
                  value={createForm.brand_type}
                  onChange={(event) => setCreateForm((current) => ({ ...current, brand_type: event.target.value as BrandRelationshipType }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {BRAND_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {createForm.brand_type !== '3rd_party' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Owner or exclusive retailer</label>
                  <select
                    value={createForm.brand_type_retailer_id}
                    onChange={(event) => setCreateForm((current) => ({ ...current, brand_type_retailer_id: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select retailer</option>
                    {retailerOptions.map((option) => (
                      <option key={option.retailer_id} value={option.retailer_id}>{option.retailer_name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div />
              )}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Status</label>
                <label className="inline-flex w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={createForm.is_current}
                    onChange={(event) => setCreateForm((current) => ({ ...current, is_current: event.target.checked }))}
                  />
                  Current
                </label>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void createBrand()}
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
                <Tags className="h-4 w-4" />
                Linked brands
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
            </div>

            {loading ? (
              <div className="px-4 py-8 text-sm text-gray-500">Loading brand links...</div>
            ) : brands.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">No brand links recorded for this retailer yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="w-[36%] px-4 py-3 text-left font-medium">Official/Primary name</th>
                      <th className="w-[25%] px-4 py-3 text-left font-medium">Brand relationship</th>
                      <th className="w-[13%] px-4 py-3 text-left font-medium">
                        <span className="inline-flex items-center gap-1">
                          Product count
                          <TooltipInfo label="The number of products found for this retailer in the last scan" />
                        </span>
                      </th>
                      <th className="w-[10%] px-4 py-3 text-left font-medium">Last seen</th>
                      <th className="w-[8%] px-4 py-3 text-left font-medium">Status</th>
                      <th className="w-[8%] px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map((row) => {
                      const rowKey = `${row.brand_id}:${row.source}`
                      const saveKey = `${row.brand_id}:${row.source}:save`
                      const deleteKey = `${row.brand_id}:${row.source}:delete`
                      const aliasesOpen = brandAliasContext?.rowKey === rowKey
                      const busy = savingKey === saveKey || savingKey === deleteKey

                      return (
                        <Fragment key={rowKey}>
                          <tr key={rowKey} className="border-t border-gray-200 align-top">
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1 space-y-2">
                                  <input
                                    type="text"
                                    value={row.draft_canonical_name}
                                    onChange={(event) =>
                                      updateBrandDraft(row.brand_id, row.source, 'draft_canonical_name', event.target.value)
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
                                  />
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${getBrandRelationshipPillClass(row.relationship_type)}`}>
                                    {getBrandRelationshipLabel(row.relationship_type)} for {retailerName}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void toggleBrandAliases(row)}
                                  disabled={busy}
                                  className={`rounded-md border p-2 transition ${aliasesOpen ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'} disabled:opacity-60`}
                                  title={`Manage aliases for ${row.canonical_name}`}
                                  aria-label={`Manage aliases for ${row.canonical_name}`}
                                >
                                  <AtSign className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-2">
                                <select
                                  value={row.draft_brand_type}
                                  onChange={(event) => updateBrandDraft(row.brand_id, row.source, 'draft_brand_type', event.target.value)}
                                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                >
                                  {BRAND_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                                {row.draft_brand_type !== '3rd_party' && (
                                  <select
                                    value={row.draft_brand_type_retailer_id}
                                    onChange={(event) => updateBrandDraft(row.brand_id, row.source, 'draft_brand_type_retailer_id', event.target.value)}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                  >
                                    <option value="">Select retailer</option>
                                    {retailerOptions.map((option) => (
                                      <option key={option.retailer_id} value={option.retailer_id}>{option.retailer_name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{row.latest_doc_count ?? 'N/A'}</td>
                            <td className="px-4 py-3 text-gray-700">{formatDate(row.last_seen_at)}</td>
                            <td className="px-4 py-3">
                              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={row.draft_is_current}
                                  onChange={(event) =>
                                    updateBrandDraft(row.brand_id, row.source, 'draft_is_current', event.target.checked)
                                  }
                                />
                                {row.draft_is_current ? 'Current' : 'Inactive'}
                              </label>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveBrand(row)}
                                  disabled={busy}
                                  className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                  title="Save brand"
                                  aria-label={`Save brand ${row.canonical_name}`}
                                >
                                  {savingKey === saveKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteBrand(row)}
                                  disabled={busy}
                                  className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                  title="Delete brand link"
                                  aria-label={`Delete brand ${row.canonical_name}`}
                                >
                                  {savingKey === deleteKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {aliasesOpen && (
                            <tr className="border-t border-blue-200 bg-blue-50/60">
                              <td colSpan={6} className="px-4 py-4">
                                <div className="rounded-lg border border-blue-200 bg-white shadow-sm">
                                  <div className="flex items-start justify-between border-b border-blue-200 px-4 py-3">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Brand aliases</p>
                                      <h4 className="mt-1 text-xl font-semibold text-gray-900">{brandAliasContext?.canonicalName}</h4>
                                      <p className="mt-1 text-sm text-gray-600">Aliases here apply to this brand across all retailers.</p>
                                    </div>
                                    {brandAliasLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                                  </div>

                                  <div className="space-y-4 px-4 py-4">
                                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                                      Additional aliases are not required for variants with different case, punctuation, spacing or accents. Example: the alias 'boots' covers variants such as Boots, BOOTS, boot's, b oots, boôts.
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                                      <div>
                                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Alias</label>
                                        <input
                                          type="text"
                                          value={brandAliasCreateForm.alias_name}
                                          onChange={(event) => setBrandAliasCreateForm((current) => ({ ...current, alias_name: event.target.value }))}
                                          placeholder="Alias"
                                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        />
                                      </div>
                                      <div className="flex items-end">
                                        <button
                                          type="button"
                                          onClick={() => void createBrandAlias()}
                                          disabled={savingKey === 'alias-create'}
                                          className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
                                        >
                                          {savingKey === 'alias-create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                          Add alias
                                        </button>
                                      </div>
                                      <div className="flex items-end">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBrandAliasContext(null)
                                            setBrandAliases([])
                                            setBrandAliasCreateForm(EMPTY_BRAND_ALIAS_FORM)
                                          }}
                                          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>

                                    {brandAliasLoading ? (
                                      <div className="py-4 text-sm text-gray-500">Loading brand aliases...</div>
                                    ) : brandAliases.length === 0 ? (
                                      <div className="py-4 text-sm text-gray-500">No aliases recorded for this brand yet.</div>
                                    ) : (
                                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                                        <table className="min-w-full text-sm">
                                          <thead className="bg-gray-50 text-gray-600">
                                            <tr>
                                              <th className="w-[62%] px-4 py-3 text-left font-medium">Alias</th>
                                              <th className="w-[18%] px-4 py-3 text-left font-medium">
                                                <span className="inline-flex items-center gap-1">
                                                  Confidence
                                                  <TooltipInfo label="Used when an alias has been derived by the software or AI" />
                                                </span>
                                              </th>
                                              <th className="w-[20%] px-4 py-3 text-right font-medium">Actions</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {brandAliases.map((aliasRow) => {
                                              const aliasSaveKey = `alias-save:${aliasRow.brand_alias_id}`
                                              const aliasDeleteKey = `alias-delete:${aliasRow.brand_alias_id}`
                                              const aliasBusy = savingKey === aliasSaveKey || savingKey === aliasDeleteKey

                                              return (
                                                <tr key={aliasRow.brand_alias_id} className="border-t border-gray-200 align-top">
                                                  <td className="px-4 py-3">
                                                    <input
                                                      type="text"
                                                      value={aliasRow.draft_alias_name}
                                                      onChange={(event) => updateBrandAliasDraft(aliasRow.brand_alias_id, 'draft_alias_name', event.target.value)}
                                                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                                    />
                                                  </td>
                                                  <td className="px-4 py-3 text-sm text-gray-600">{formatConfidence(aliasRow.confidence)}</td>
                                                  <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-2">
                                                      <button
                                                        type="button"
                                                        onClick={() => void saveBrandAlias(aliasRow)}
                                                        disabled={aliasBusy}
                                                        className="rounded-md border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                                        title="Save alias"
                                                        aria-label={`Save alias ${aliasRow.alias_name}`}
                                                      >
                                                        {savingKey === aliasSaveKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => void deleteBrandAlias(aliasRow)}
                                                        disabled={aliasBusy}
                                                        className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                                        title="Delete alias"
                                                        aria-label={`Delete alias ${aliasRow.alias_name}`}
                                                      >
                                                        {savingKey === aliasDeleteKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                              </td>
                            </tr>
                          )}
                        </Fragment>
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