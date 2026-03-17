'use client'

import { Fragment, useState, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlugPreview {
  provider: string
  slug: string
  row_count: number
  months: string[]
  inferred_retailer_id: string | null
  db_assignment: string | null
  has_self_rows: boolean
}

interface PreviewResponse {
  parsed_months: string[]
  slugs: SlugPreview[]
  existing_conflicts: Array<{ retailer_id: string; month: string }>
  account_conflicts: AccountConflict[]
  parse_errors: number
  summary: {
    total_rows: number
    unique_slugs: number
    resolved_slugs: number
    unresolved_slugs: number
  }
}

interface SlugAssignment {
  provider: string
  slug: string
  retailer_id: string | null
}

interface AccountConflictEntry {
  provider: string
  slug: string
  customer_id: string
  account_name: string
  row_count: number
  is_shared: boolean
  recommended: boolean
}

interface AccountConflict {
  retailer_id: string
  month: string  // YYYY-MM
  accounts: AccountConflictEntry[]
}

type Step = 'upload' | 'assign' | 'done'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: '1. Upload' },
    { key: 'assign', label: '2. Assign + import' },
    { key: 'done', label: '3. Done' },
  ]
  const idx = steps.findIndex(s => s.key === step)
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 ${
              i < idx
                ? 'bg-[#1C1D1C] border-[#1C1D1C] text-white'
                : i === idx
                ? 'bg-[#F9B103] border-[#F9B103] text-[#1C1D1C]'
                : 'bg-white border-gray-300 text-gray-400'
            }`}
          >
            {i < idx ? '✓' : i + 1}
          </div>
          <span
            className={`text-sm font-medium ${
              i === idx ? 'text-[#1C1D1C] font-semibold' : i < idx ? 'text-[#1C1D1C]' : 'text-gray-400'
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <div className="w-8 h-0.5 bg-gray-200 mx-1" />}
        </div>
      ))}
    </div>
  )
}

function AlertBox({
  type,
  message,
}: {
  type: 'error' | 'warning' | 'info'
  message: string
}) {
  const colours = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-[#F2F1EB] border-gray-300 text-gray-700',
  }
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${colours[type]}`}>{message}</div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AuctionUploadDashboard() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [assignments, setAssignments] = useState<SlugAssignment[]>([])
  const [overwrite, setOverwrite] = useState(false)
  const [conflictsFromImport, setConflictsFromImport] = useState<{ retailer_id: string; month: string }[]>([])
  const [importConflictDetected, setImportConflictDetected] = useState(false)
  // User-chosen preferred account per retailer+month conflict.
  // key: "retailer_id::month" (e.g. "arket::2026-01"), value: "provider:slug"
  const [preferredAccountOverrides, setPreferredAccountOverrides] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<{
    upload_id: number
    rows_inserted: number
    months_imported: string[]
    retailers_affected: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Step 1: Upload ──────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) setFile(f)
    else setError('Please upload a CSV file.')
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handlePreview = async () => {
    if (!file) return
    setError(null)
    setPreviewing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/auction-upload/preview', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Preview failed (${res.status})`)
      }
      const data: PreviewResponse = await res.json()
      setPreview(data)

      // Initialise assignments from inferred values
      const initial: SlugAssignment[] = data.slugs.map(s => ({
        provider: s.provider,
        slug: s.slug,
        retailer_id: s.inferred_retailer_id,
      }))
      setAssignments(initial)

      // Initialise preferred account overrides from recommended values
      const initOverrides: Record<string, string> = {}
      for (const conflict of (data.account_conflicts ?? [])) {
        const recommended = conflict.accounts.find(a => a.recommended)
        if (recommended) {
          initOverrides[`${conflict.retailer_id}::${conflict.month}`] =
            `${recommended.provider}:${recommended.slug}`
        }
      }
      setPreferredAccountOverrides(initOverrides)
      setStep('assign')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  // ── Step 2: Assign ──────────────────────────────────────────────────────────

  const updateAssignment = (provider: string, slug: string, retailer_id: string | null) => {
    setAssignments(prev =>
      prev.map(a => (a.provider === provider && a.slug === slug ? { ...a, retailer_id } : a),
    ))
  }

  // ── Step 3: Confirm → Import ────────────────────────────────────────────────

  const handleImport = async () => {
    if (!file) return
    setError(null)
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('confirmed_assignments', JSON.stringify(assignments))
      fd.append('overwrite', overwrite.toString())
      if (notes.trim()) fd.append('notes', notes.trim())
      // Pass explicit account preference overrides (retailer+month → preferred provider:slug)
      const overridesList = Object.entries(preferredAccountOverrides).map(([k, v]) => {
        const [retailer_id, month] = k.split('::')
        const colonIdx = v.indexOf(':')
        const provider = v.slice(0, colonIdx)
        const slug = v.slice(colonIdx + 1)
        return { retailer_id, month, provider, slug }
      })
      if (overridesList.length > 0) fd.append('preferred_overrides', JSON.stringify(overridesList))

      const res = await fetch('/api/admin/auction-upload/import', { method: 'POST', body: fd })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}))
        // Any 409 means data already exists — enable overwrite and prompt the user.
        // If the server returned a typed conflict list, use it; otherwise show a generic prompt.
        const conflicts: { retailer_id: string; month: string }[] =
          body.conflicts && Array.isArray(body.conflicts) ? body.conflicts : []
        setConflictsFromImport(conflicts)
        setImportConflictDetected(true)
        setOverwrite(true)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Import failed (${res.status})`)
      }
      const data = await res.json()
      setImportResult(data)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const resetFlow = () => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setAssignments([])
    setOverwrite(false)
    setConflictsFromImport([])
    setImportConflictDetected(false)
    setPreferredAccountOverrides({})
    setNotes('')
    setImportResult(null)
    setError(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <StepIndicator step={step} />

      {error && (
        <div className="mb-6">
          <AlertBox type="error" message={error} />
        </div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === 'upload' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Select CSV file</h2>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colours ${
              dragActive
                ? 'border-[#1C1D1C] bg-[#F2F1EB]'
                : file
                ? 'border-[#1C1D1C] bg-[#F2F1EB]'
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <div>
                <div className="text-[#1C1D1C] text-3xl mb-2">✓</div>
                <p className="font-medium text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {(file.size / 1024).toFixed(0)} KB — click to change
                </p>
              </div>
            ) : (
              <div>
                <div className="text-gray-400 text-4xl mb-3">↑</div>
                <p className="font-medium text-gray-700">Drop a CSV here or click to browse</p>
                <p className="text-sm text-gray-400 mt-1">
                  Google Ads Auction Insights export (monthly)
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handlePreview}
              disabled={!file || previewing}
              className="px-6 py-2.5 bg-[#1C1D1C] text-white rounded-lg font-medium text-sm
                         hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colours"
            >
              {previewing ? 'Analysing…' : 'Next: Review assignments →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Assign ── */}
      {step === 'assign' && preview && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Review retailer assignments</h2>
          <p className="text-sm text-gray-500 mb-4">
            Verify or correct the retailer mapping for each campaign found in the file.
            Rows shown in amber need a manual assignment.
          </p>

          {/* Summary pills */}
          <div className="flex gap-3 mb-6 flex-wrap">
            {preview.parsed_months.map(m => (
              <span
                key={m}
                className="px-3 py-1 bg-[#F2F1EB] text-[#1C1D1C] border border-gray-200 rounded-full text-xs font-medium"
              >
                {formatMonth(m)}
              </span>
            ))}
            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
              {preview.summary.total_rows.toLocaleString()} rows
            </span>
            {preview.summary.unresolved_slugs > 0 && (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                {preview.summary.unresolved_slugs} unassigned
              </span>
            )}
          </div>

          {preview.parse_errors > 0 && (
            <div className="mb-4">
              <AlertBox
                type="warning"
                message={`${preview.parse_errors} rows could not be parsed and will be skipped.`}
              />
            </div>
          )}

          {preview.existing_conflicts.length > 0 && conflictsFromImport.length === 0 && (
            <div className="mb-4">
              <AlertBox
                type="warning"
                message={`${preview.existing_conflicts.length} retailer/month combination(s) already have data. Enable overwrite below if you want to replace them.`}
              />
            </div>
          )}

          {importConflictDetected && (
            <div className="mb-4">
              <AlertBox
                type="warning"
                message="Data already exists for some periods. Overwrite has been enabled; click Import now again to replace existing rows."
              />
              {conflictsFromImport.length > 0 && (
                <ul className="mt-2 text-xs text-amber-800 space-y-0.5 pl-2">
                  {conflictsFromImport.map(c => (
                    <li key={`${c.retailer_id}:${c.month}`}>
                      {c.retailer_id} — {formatMonth(c.month)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mb-5 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={e => setOverwrite(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#1C1D1C] focus:ring-gray-500"
              />
              <span className="text-sm text-gray-700">
                Overwrite existing data for conflicting months
              </span>
            </label>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. January 2026 monthly upload"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none
                         focus:ring-2 focus:ring-gray-400 resize-none"
            />
          </div>

          <div className="flex items-center justify-end mb-6">
            <button
              onClick={handleImport}
              disabled={importing}
              className={`px-6 py-2.5 text-white rounded-lg font-medium text-sm
                         disabled:cursor-not-allowed transition-all
                         ${importing
                           ? 'bg-[#1C1D1C] opacity-70 animate-pulse cursor-wait'
                           : 'bg-[#1C1D1C] hover:bg-black disabled:opacity-50'
                         }`}
            >
              {importing ? 'Importing and processing…' : 'Import now'}
            </button>
          </div>

          {/* ── Account preference section (only shown when conflicts exist) ── */}
          {(preview.account_conflicts ?? []).length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-800">Account preferences</h3>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                  {preview.account_conflicts.length} conflict{preview.account_conflicts.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                These retailers have data from multiple Google Ads accounts in the same month.
                Choose which account should be used as the primary display source.
                The algorithm recommends a default — change it only if needed.
              </p>
              <div className="space-y-3">
                {preview.account_conflicts.map(conflict => {
                  const overrideKey = `${conflict.retailer_id}::${conflict.month}`
                  const selected = preferredAccountOverrides[overrideKey] ?? ''
                  return (
                    <div
                      key={overrideKey}
                      className="border border-amber-200 rounded-lg p-4 bg-amber-50"
                    >
                      <div className="font-medium text-sm text-gray-800 mb-3">
                        <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs mr-2">
                          {conflict.retailer_id}
                        </span>
                        {formatMonth(conflict.month)}
                      </div>
                      <div className="space-y-2">
                        {conflict.accounts.map(acc => {
                          const val = `${acc.provider}:${acc.slug}`
                          const isSelected = selected === val
                          return (
                            <label
                              key={val}
                              className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                                isSelected
                                  ? 'bg-white border-[#1C1D1C] shadow-sm'
                                  : 'bg-white/60 border-transparent hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name={overrideKey}
                                value={val}
                                checked={isSelected}
                                onChange={() =>
                                  setPreferredAccountOverrides(prev => ({
                                    ...prev,
                                    [overrideKey]: val,
                                  }))
                                }
                                className="mt-0.5 accent-[#1C1D1C]"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm text-gray-800">
                                    {acc.account_name}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    acc.is_shared
                                      ? 'bg-[#F2F1EB] text-gray-600 border border-gray-300'
                                      : 'bg-[#1C1D1C] text-white'
                                  }`}>
                                    {acc.is_shared ? 'Shared' : 'Dedicated'}
                                  </span>
                                  {acc.recommended && (
                                    <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {acc.account_name === acc.slug ? acc.provider : `${acc.provider}-${acc.slug}`} · {acc.customer_id} · {acc.row_count} rows
                                </div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Retailer name assignments table ── */}
          {(() => {
            // Slugs present in the uploaded file
            const inFileKeys = new Set(preview.slugs.map(s => `${s.provider}:${s.slug}`))

            // Status logic:
            //  existing  → db_assignment already set in DB → green
            //  new       → no db_assignment but auto-inferred this run → yellow (shown first)
            //  unassigned → no retailer_id at all → amber
            const getStatus = (a: SlugAssignment, info: SlugPreview | undefined) => {
              if (info?.db_assignment != null) return 'existing'
              if (a.retailer_id != null) return 'new'
              return 'unassigned'
            }
            const statusOrder = { new: 0, existing: 1, unassigned: 2 }

            const inFile = assignments
              .filter(a => inFileKeys.has(`${a.provider}:${a.slug}`))
              .slice()
              .sort((a, b) => {
                const infoA = preview.slugs.find(s => s.provider === a.provider && s.slug === a.slug)
                const infoB = preview.slugs.find(s => s.provider === b.provider && s.slug === b.slug)
                const sa = statusOrder[getStatus(a, infoA)]
                const sb = statusOrder[getStatus(b, infoB)]
                if (sa !== sb) return sa - sb
                return `${a.provider}:${a.slug}`.localeCompare(`${b.provider}:${b.slug}`)
              })
            const others = assignments
              .filter(a => !inFileKeys.has(`${a.provider}:${a.slug}`))
              .slice()
              .sort((a, b) => `${a.provider}:${a.slug}`.localeCompare(`${b.provider}:${b.slug}`))
            const sorted = [...inFile, ...others]
            return (
              <>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-gray-600">Provider / Retailer name</th>
                        <th className="px-4 py-2.5 text-left font-medium text-gray-600">Months</th>
                        <th className="px-4 py-2.5 text-left font-medium text-gray-600">Rows</th>
                        <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-48">Retailer ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((a, idx) => {
                        const info = preview.slugs.find(
                          s => s.provider === a.provider && s.slug === a.slug,
                        )
                        const isInFile = inFileKeys.has(`${a.provider}:${a.slug}`)
                        const status = isInFile ? getStatus(a, info) : 'other'
                        // Section divider between in-file and other rows
                        const showDivider = !isInFile && idx > 0 && inFileKeys.has(
                          `${sorted[idx - 1].provider}:${sorted[idx - 1].slug}`
                        )
                        const rowBg =
                          !isInFile ? 'opacity-60' :
                          status === 'existing' ? 'bg-teal-50' :
                          status === 'new' ? 'bg-yellow-50' :
                          'bg-amber-50'
                        return (
                          <Fragment key={`rows-${a.provider}:${a.slug}`}>
                            {showDivider && (
                              <tr key={`divider-${a.provider}-${a.slug}`}>
                                <td colSpan={4} className="px-4 py-1.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                                  Other known retailers (not in this file)
                                </td>
                              </tr>
                            )}
                            <tr
                              key={`${a.provider}:${a.slug}`}
                              className={`border-b border-gray-100 last:border-0 ${rowBg}`}
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                                    {a.provider}-{a.slug}
                                  </span>
                                  {isInFile && status === 'existing' && (
                                    <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium">
                                      Existing
                                    </span>
                                  )}
                                  {isInFile && status === 'new' && (
                                    <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                                      New
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">
                                {info?.months.map(formatMonth).join(', ') ?? '—'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500">{info?.row_count ?? 0}</td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="text"
                                  value={a.retailer_id ?? ''}
                                  placeholder="retailer-id or leave blank"
                                  onChange={e =>
                                    updateAssignment(a.provider, a.slug, e.target.value.trim() || null)
                                  }
                                  className={`w-full border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 ${
                                    status === 'unassigned'
                                      ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                                      : status === 'new'
                                      ? 'border-yellow-300 bg-yellow-50 focus:ring-yellow-400'
                                      : 'border-gray-200 bg-white focus:ring-gray-400'
                                  }`}
                                />
                              </td>
                            </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  Leave blank to import data without a retailer assignment (visible in unassigned view).
                </div>
              </>
            )
          })()}

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => { setStep('upload'); setError(null) }}
              className="px-4 py-2 text-gray-600 text-sm hover:text-gray-900"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Done ── */}
      {step === 'done' && importResult && (
        <div className="text-center py-8">
          <div className="text-5xl mb-4">✓</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Import complete</h2>
          <p className="text-gray-500 text-sm mb-6">
            {importResult.rows_inserted.toLocaleString()} rows imported across{' '}
            {importResult.months_imported.length} month
            {importResult.months_imported.length !== 1 ? 's' : ''} for{' '}
            {importResult.retailers_affected} retailer
            {importResult.retailers_affected !== 1 ? 's' : ''}.
          </p>
          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {importResult.months_imported.map(m => (
              <span
                key={m}
                className="px-3 py-1 bg-[#F2F1EB] text-[#1C1D1C] border border-gray-200 rounded-full text-xs font-medium"
              >
                {formatMonth(m)}
              </span>
            ))}
          </div>
          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={resetFlow}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm
                         hover:bg-gray-50 transition-colours"
            >
              Upload another file
            </button>
            <a
              href="/dashboard"
              className="px-5 py-2 bg-[#F2C94C] text-[#1C1D1C] rounded-lg text-sm
                         hover:bg-[#E2B93F] transition-colours"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
