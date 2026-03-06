'use client'

/**
 * Test page: Period Selector design variants
 *
 * Three approaches to combining the view-type toggle (weekly/monthly)
 * with period window navigation. Fully interactive, no API calls.
 * Visit: /test-period-selector
 */

import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ── Fake available data ───────────────────────────────────────────────────────

function buildMonths(): { period: string; label: string }[] {
  const result = []
  for (let i = 0; i < 13; i++) {
    // Feb 2025 → Feb 2026
    const d = new Date(Date.UTC(2025, 1 + i, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    result.push({
      period: `${y}-${String(m).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    })
  }
  return result
}

function buildWeeks(): { period: string; label: string }[] {
  const result = []
  const origin = new Date(Date.UTC(2024, 11, 29)) // Sun 29 Dec 2024
  for (let i = 0; i < 74; i++) {
    const d = new Date(origin.getTime() + i * 7 * 86_400_000)
    result.push({
      period: d.toISOString().slice(0, 10),
      label: `w/c ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
    })
  }
  return result
}

const ALL_MONTHS = buildMonths()
const ALL_WEEKS = buildWeeks()

// ── Types ────────────────────────────────────────────────────────────────────

type ViewType = 'weekly' | 'monthly'

// ── Shared micro-components ───────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewType; onChange: (v: ViewType) => void }) {
  return (
    <div className="inline-flex rounded border border-gray-200 overflow-hidden text-sm font-medium">
      {(['weekly', 'monthly'] as ViewType[]).map((v, i) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-4 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
            view === v ? 'bg-[#1C1D1C] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {v === 'weekly' ? 'Week on Week' : 'Month on Month'}
        </button>
      ))}
    </div>
  )
}

function StepButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'prev' | 'next'
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Previous period' : 'Next period'}
      className="flex items-center justify-center w-8 h-8 rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {direction === 'prev' ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
    </button>
  )
}

function WindowSummary({ from, to, count }: { from: string; to: string; count: number }) {
  return (
    <div className="mt-3 px-3 py-2 bg-[#F2F1EB] rounded text-xs text-gray-600 flex items-center gap-1.5">
      <span className="font-semibold text-gray-900">Showing:</span>
      <span>{from}</span>
      <span className="text-gray-400">→</span>
      <span>{to}</span>
      <span className="ml-auto text-gray-400">{count} periods</span>
    </div>
  )
}

function LatestButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded border border-[#F9B103] text-[#c47f00] font-medium hover:bg-[#F9B103]/10 transition-colors"
    >
      Latest ›
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT A — Compact trailing window (single row)
//
// [Week on Week | Month on Month]  ‹  Jan 2026  ›  "last 13"  [Latest]
//
// Simplest evolution of the current setup.
// Arrows step ±1 period. Window always trails N periods back from anchor.
// "Latest" shortcut when browsing history.
// ─────────────────────────────────────────────────────────────────────────────

function VariantA() {
  const [view, setView] = useState<ViewType>('monthly')
  const items = view === 'monthly' ? ALL_MONTHS : ALL_WEEKS
  const N = 13

  const [anchorIdx, setAnchorIdx] = useState(items.length - 1)

  function handleViewChange(v: ViewType) {
    setView(v)
    const newItems = v === 'monthly' ? ALL_MONTHS : ALL_WEEKS
    setAnchorIdx(newItems.length - 1)
  }

  function step(delta: number) {
    setAnchorIdx((i) => Math.max(N - 1, Math.min(items.length - 1, i + delta)))
  }

  const windowStart = Math.max(0, anchorIdx - N + 1)
  const windowItems = items.slice(windowStart, anchorIdx + 1)
  const isLatest = anchorIdx === items.length - 1
  const anchor = items[anchorIdx]

  return (
    <section>
      <div className="mb-3">
        <h3 className="text-base font-bold text-gray-900">Variant A — Single-row, trailing window</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Minimal. One row. View toggle on the left, arrow-navigated anchor on the right. Always shows the last {N} periods
          ending at the anchor. Equivalent to the current "13 Weeks / 13 Months" toggle, but with navigation.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        <ViewToggle view={view} onChange={handleViewChange} />

        <div className="h-5 w-px bg-gray-200 hidden sm:block" />

        <div className="flex items-center gap-2">
          <StepButton direction="prev" onClick={() => step(-1)} disabled={anchorIdx <= N - 1} />
          <span className="text-sm font-medium text-gray-800 min-w-[160px] text-center tabular-nums">
            {anchor?.label ?? '—'}
          </span>
          <StepButton direction="next" onClick={() => step(1)} disabled={isLatest} />
        </div>

        <span className="text-xs text-gray-400">last {windowItems.length}</span>
        {!isLatest && <LatestButton onClick={() => setAnchorIdx(items.length - 1)} />}
      </div>

      <WindowSummary
        from={windowItems[0]?.label ?? '—'}
        to={windowItems[windowItems.length - 1]?.label ?? '—'}
        count={windowItems.length}
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT B — Explicit window size + anchor (two rows)
//
// Row 1: [Week on Week | Month on Month]
// Row 2: [3 months] [6 months] [13 months]   ‹  ending Jan 2026  ›  [Latest]
//
// User controls both the window size and the end anchor independently.
// Window-size pills change to sensible defaults per view type.
// Closest to your mockup but drops "Starting/Ending" in favour of always
// displaying a trailing window — clearer because you're always looking back.
// ─────────────────────────────────────────────────────────────────────────────

function VariantB() {
  const [view, setView] = useState<ViewType>('monthly')
  const items = view === 'monthly' ? ALL_MONTHS : ALL_WEEKS

  const windowOptions = view === 'monthly' ? [3, 6, 13] : [8, 13, 26]
  const [windowSize, setWindowSize] = useState(13)
  const [anchorIdx, setAnchorIdx] = useState(items.length - 1)

  function handleViewChange(v: ViewType) {
    setView(v)
    const newItems = v === 'monthly' ? ALL_MONTHS : ALL_WEEKS
    const newOpts = v === 'monthly' ? [3, 6, 13] : [8, 13, 26]
    const defaultSize = newOpts[newOpts.length - 1]
    setWindowSize(defaultSize)
    setAnchorIdx(newItems.length - 1)
  }

  const minAnchor = windowSize - 1
  const isLatest = anchorIdx === items.length - 1

  function step(delta: number) {
    setAnchorIdx((i) => Math.max(minAnchor, Math.min(items.length - 1, i + delta)))
  }

  const windowStart = Math.max(0, anchorIdx - windowSize + 1)
  const windowItems = items.slice(windowStart, anchorIdx + 1)
  const anchor = items[anchorIdx]
  const periodWord = view === 'monthly' ? 'month' : 'week'

  return (
    <section>
      <div className="mb-3">
        <h3 className="text-base font-bold text-gray-900">Variant B — Window size + end anchor</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Two controls: <em>how many</em> periods to show (window-size pills) and <em>ending when</em> (arrow navigator).
          Slightly more expressive than A. Replaces the "Starting / Ending" idea with a simpler "ending at" framing —
          always a trailing look-back, which is more analytically natural.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 space-y-2.5">
        {/* Row 1 — view type */}
        <ViewToggle view={view} onChange={handleViewChange} />

        {/* Row 2 — window size + anchor */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Window-size pills */}
          <div className="inline-flex rounded border border-gray-200 overflow-hidden text-xs font-medium">
            {windowOptions.map((n, i) => {
              const unavailable = n > items.length
              const active = windowSize === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    if (!unavailable) {
                      setWindowSize(n)
                      // Ensure anchor is far enough in to fill the new window
                      setAnchorIdx((prev) => Math.max(n - 1, prev))
                    }
                  }}
                  disabled={unavailable}
                  className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                    unavailable
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      : active
                      ? 'bg-[#F9B103] text-[#1C1D1C] font-bold'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  title={unavailable ? `Only ${items.length} ${periodWord}s available` : undefined}
                >
                  {n} {n === 1 ? periodWord : `${periodWord}s`}
                </button>
              )
            })}
          </div>

          <div className="h-5 w-px bg-gray-200" />

          {/* Anchor navigator */}
          <div className="flex items-center gap-1.5">
            <StepButton direction="prev" onClick={() => step(-1)} disabled={anchorIdx <= minAnchor} />
            <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
              ending&nbsp;
              <span className="text-gray-900">{anchor?.label ?? '—'}</span>
            </span>
            <StepButton direction="next" onClick={() => step(1)} disabled={isLatest} />
          </div>

          {!isLatest && <LatestButton onClick={() => setAnchorIdx(items.length - 1)} />}
        </div>
      </div>

      <WindowSummary
        from={windowItems[0]?.label ?? '—'}
        to={windowItems[windowItems.length - 1]?.label ?? '—'}
        count={windowItems.length}
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT C — Visual timeline track
//
// [Week on Week | Month on Month]
// [────────────[████████████]────]   ‹  ending Jan 2026  ›
// [oldest label    context     newest label]
//
// A proportional dot-track spanning the full available history.
// Gold segment = current window, dark stub = anchor point.
// Click any dot to move the window end there.
// Best for communicating data coverage; scales well to 74 weeks.
// ─────────────────────────────────────────────────────────────────────────────

function VariantC() {
  const [view, setView] = useState<ViewType>('monthly')
  const items = view === 'monthly' ? ALL_MONTHS : ALL_WEEKS
  const N = 13

  const [anchorIdx, setAnchorIdx] = useState(items.length - 1)

  function handleViewChange(v: ViewType) {
    setView(v)
    const newItems = v === 'monthly' ? ALL_MONTHS : ALL_WEEKS
    setAnchorIdx(newItems.length - 1)
  }

  const minAnchor = N - 1
  const isLatest = anchorIdx === items.length - 1

  function step(delta: number) {
    setAnchorIdx((i) => Math.max(minAnchor, Math.min(items.length - 1, i + delta)))
  }

  const windowStart = Math.max(0, anchorIdx - N + 1)
  const anchor = items[anchorIdx]

  return (
    <section>
      <div className="mb-3">
        <h3 className="text-base font-bold text-gray-900">Variant C — Visual timeline track</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          A proportional bar spanning the full available history. Gold segment = the selected window.
          Dark stub = anchor. Click any segment to jump to that period; arrows step ±1.
          Communicates data coverage and position in history at a glance — especially useful for retailers
          with partial history who can see exactly where their data starts.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg px-4 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <ViewToggle view={view} onChange={handleViewChange} />
          {!isLatest && <LatestButton onClick={() => setAnchorIdx(items.length - 1)} />}
        </div>

        {/* Timeline track + arrows */}
        <div className="flex items-center gap-2">
          <StepButton direction="prev" onClick={() => step(-1)} disabled={anchorIdx <= minAnchor} />

          <div
            className="flex-1 flex items-end gap-[2px] h-8"
            role="group"
            aria-label="Period timeline"
          >
            {items.map((item, i) => {
              const inWindow = i >= windowStart && i <= anchorIdx
              const isAnchorPoint = i === anchorIdx
              let heightClass = 'h-2'
              let colourClass = 'bg-gray-200 hover:bg-gray-300'
              if (isAnchorPoint) {
                heightClass = 'h-8'
                colourClass = 'bg-[#1C1D1C]'
              } else if (inWindow) {
                heightClass = 'h-5'
                colourClass = 'bg-[#F9B103] hover:bg-[#e0a003]'
              } else {
                colourClass = 'bg-gray-200 hover:bg-gray-300'
              }
              return (
                <button
                  key={item.period}
                  type="button"
                  title={item.label}
                  onClick={() => setAnchorIdx(Math.max(minAnchor, i))}
                  className={`flex-1 rounded-sm self-end transition-all cursor-pointer ${heightClass} ${colourClass}`}
                  aria-label={`Jump to ${item.label}`}
                />
              )
            })}
          </div>

          <StepButton direction="next" onClick={() => step(1)} disabled={isLatest} />
        </div>

        {/* Range labels */}
        <div className="flex items-center justify-between text-xs text-gray-400 px-10">
          <span>{items[0]?.label}</span>
          <span className="font-medium text-gray-700">
            ending&nbsp;
            <span className="text-gray-900">{anchor?.label}</span>
          </span>
          <span>{items[items.length - 1]?.label}</span>
        </div>
      </div>

      <WindowSummary
        from={items[windowStart]?.label ?? '—'}
        to={anchor?.label ?? '—'}
        count={anchorIdx - windowStart + 1}
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page shell
// ─────────────────────────────────────────────────────────────────────────────

export default function TestPeriodSelectorPage() {
  return (
    <div className="min-h-screen bg-[#F2F1EB] p-8">
      <div className="max-w-3xl mx-auto space-y-12">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1C1D1C]">Period Selector — Design Variants</h1>
          <p className="text-sm text-gray-600 mt-2 max-w-prose">
            Three interactive approaches to combining the view-type toggle (week / month) with period window
            navigation. All variants use a <strong>trailing window ending at an anchor</strong> model — you move
            the anchor and the window trails behind it. This replaces the "Starting / Ending" concept from the
            mockup with something more self-evident: you&rsquo;re always looking at the last N periods <em>up to</em>{' '}
            the selected date.
          </p>
          <p className="text-xs text-gray-400 mt-3">
            Fake data: 13 months (Feb 2025 → Feb 2026) · 74 weeks (29 Dec 2024 → 22 Mar 2026)
          </p>
        </div>

        {/* Variants */}
        <VariantA />
        <VariantB />
        <VariantC />

        {/* Comparison notes */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-900">Comparison notes</h3>
          <table className="w-full text-sm text-gray-700 border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1.5 font-semibold text-gray-900 w-1/4">Variant</th>
                <th className="text-left py-1.5 font-semibold text-gray-900 w-1/4">Pro</th>
                <th className="text-left py-1.5 font-semibold text-gray-900 w-1/4">Con</th>
                <th className="text-left py-1.5 font-semibold text-gray-900">Best for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr>
                <td className="py-2 font-medium">A — Single row</td>
                <td className="py-2">Minimal, familiar</td>
                <td className="py-2">No window-size control</td>
                <td className="py-2">Most users, quick navigation</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">B — Two rows</td>
                <td className="py-2">Explicit, discoverable</td>
                <td className="py-2">More UI surface area</td>
                <td className="py-2">Power users wanting 3/6/13 windows</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">C — Timeline track</td>
                <td className="py-2">Shows data availability; very visual</td>
                <td className="py-2">Unconventional; fixed N</td>
                <td className="py-2">Retailers with partial / varying history</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
