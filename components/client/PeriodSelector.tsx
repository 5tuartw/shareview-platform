'use client'

/**
 * PeriodSelector — unified period navigation control for the data header.
 *
 * Combines:
 *   - Week on Week / Month on Month view toggle
 *   - Window-size pills  (4w · 8w · 13w · 26w  /  3m · 6m · 13m)
 *   - Visual timeline track: exactly `windowSize` bars, all gold, anchor bar dark
 *   - Arrow buttons to step ±1 period
 *   - Thin scrollbar-style progress indicator showing position in full history
 *
 * All state (overviewView, windowSize, anchor period) is managed through
 * DateRangeContext so that OverviewTab can react without prop drilling.
 */

import React, { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDateRange } from '@/lib/contexts/DateRangeContext'
import type { AvailableMonth } from '@/lib/analytics-utils'

interface PeriodSelectorProps {
  availableMonths: AvailableMonth[]
  availableWeeks: { period: string; label: string }[]
}

const MONTHLY_WINDOW_OPTIONS = [3, 6, 12]
const WEEKLY_WINDOW_OPTIONS = [4, 8, 13, 26]

/** Uniform comparison time for period strings ('YYYY-MM', date-only, or ISO datetime). */
function toComparableTime(period: string, view: 'weekly' | 'monthly'): number {
  const base = period.trim()
  let normalised = base

  if (view === 'monthly') {
    const monthKey = base.slice(0, 7)
    normalised = `${monthKey}-01T00:00:00Z`
  } else {
    const dateKey = base.slice(0, 10)
    normalised = `${dateKey}T00:00:00Z`
  }

  const parsed = new Date(normalised)
  const time = parsed.getTime()
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

function monthLabel(period: string): string {
  const monthKey = period.slice(0, 7)
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

type SelectorItem = { period: string; label: string }

export default function PeriodSelector({ availableMonths, availableWeeks }: PeriodSelectorProps) {
  const {
    period, setPeriod,
    overviewView, setOverviewView,
    windowSize, setWindowSize,
    weekPeriod, setWeekPeriod,
  } = useDateRange()

  // Normalise availableMonths to the same shape as availableWeeks  
  const normalMonths = useMemo<SelectorItem[]>(
    () => availableMonths.map((m) => ({ period: m.period, label: monthLabel(m.period) })),
    [availableMonths]
  )

  const items: SelectorItem[] = overviewView === 'monthly' ? normalMonths : availableWeeks
  const windowOptions = overviewView === 'monthly' ? MONTHLY_WINDOW_OPTIONS : WEEKLY_WINDOW_OPTIONS

  // Effective window: can't exceed available items
  const effectiveWindow = Math.min(windowSize, items.length || windowSize)

  // Anchor index — last item whose period ≤ the selected anchor
  const anchorIdx = useMemo(() => {
    if (!items.length) return 0
    const anchorStr = overviewView === 'weekly' ? weekPeriod : period
    if (!anchorStr) return items.length - 1
    const anchorTime = toComparableTime(anchorStr, overviewView)
    for (let i = items.length - 1; i >= 0; i--) {
      if (toComparableTime(items[i].period, overviewView) <= anchorTime) return i
    }
    return items.length - 1
  }, [items, period, weekPeriod, overviewView])

  const windowStart = Math.max(0, anchorIdx - effectiveWindow + 1)
  const windowItems = items.slice(windowStart, anchorIdx + 1)
  const anchor = items[anchorIdx]

  const canStepBack = anchorIdx > 0
  const canStepForward = anchorIdx < items.length - 1

  function setAnchor(newIdx: number) {
    const clamped = Math.max(0, Math.min(items.length - 1, newIdx))
    const item = items[clamped]
    if (!item) return
    if (overviewView === 'weekly') {
      setWeekPeriod(item.period)
    } else {
      setPeriod(item.period)
    }
  }

  function handleViewChange(v: 'weekly' | 'monthly') {
    setOverviewView(v)
    // Reset window size to the largest option for the new view
    const newOpts = v === 'monthly' ? MONTHLY_WINDOW_OPTIONS : WEEKLY_WINDOW_OPTIONS
    setWindowSize(newOpts[newOpts.length - 1])
    // Jump anchor to the latest available item in the new view
    const newItems = v === 'monthly' ? normalMonths : availableWeeks
    const latest = newItems[newItems.length - 1]
    if (latest) {
      if (v === 'weekly') setWeekPeriod(latest.period)
      else setPeriod(latest.period)
    }
  }

  function handleWindowSizeChange(n: number) {
    setWindowSize(n)
    // Push anchor forward enough that we can show a full window
    setAnchor(Math.max(n - 1, anchorIdx))
  }

  // Progress bar: fraction through the full available history
  const progressLeft = items.length > 1 ? (windowStart / items.length) * 100 : 0
  const progressWidth = items.length > 1 ? (windowItems.length / items.length) * 100 : 100

  // Loading state: no items yet for the selected view type
  const loading = items.length === 0

  return (
    <div className="flex flex-col gap-1.5 min-w-[300px] max-w-[500px]">

      {/* ── Row 1: View toggle + window-size pills ───────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap justify-end">

        {/* View type toggle */}
        <div className="inline-flex rounded border border-gray-200 overflow-hidden text-xs font-medium">
          {(['weekly', 'monthly'] as const).map((v, i) => (
            <button
              key={v}
              type="button"
              onClick={() => handleViewChange(v)}
              className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                overviewView === v
                  ? 'bg-[#1C1D1C] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v === 'weekly' ? 'Week on Week' : 'Month on Month'}
            </button>
          ))}
        </div>

        {/* Window-size pills */}
        <div className="inline-flex rounded border border-gray-200 overflow-hidden text-xs font-medium">
          {windowOptions.map((n, i) => {
            const unavailable = n > (items.length || 0) && !loading
            const active = windowSize === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => { if (!unavailable) handleWindowSizeChange(n) }}
                disabled={unavailable}
                title={unavailable ? `Only ${items.length} period${items.length === 1 ? '' : 's'} available` : undefined}
                className={`px-2.5 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                  unavailable
                    ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                    : active
                    ? 'bg-[#F9B103] text-[#1C1D1C] font-bold'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {n}{overviewView === 'weekly' ? 'w' : 'm'}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Row 2: Arrows + track ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">

        <button
          type="button"
          onClick={() => setAnchor(anchorIdx - 1)}
          disabled={!canStepBack || loading}
          aria-label="Previous period"
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Timeline track */}
        {loading ? (
          <div className="flex-1 h-8 rounded bg-gray-100 animate-pulse" />
        ) : (
          <div
            className="flex-1 flex items-end gap-[3px] h-8"
            role="group"
            aria-label="Period timeline"
          >
            {windowItems.map((item, j) => {
              const isAnchor = j === windowItems.length - 1
              return (
                <button
                  key={item.period}
                  type="button"
                  title={item.label}
                  onClick={() => setAnchor(windowStart + j)}
                  aria-label={item.label}
                  className={`flex-1 rounded-sm self-end transition-all cursor-pointer ${
                    isAnchor
                      ? 'h-8 bg-[#1C1D1C] hover:bg-[#333534]'
                      : 'h-5 bg-[#F9B103] hover:bg-[#e0a003]'
                  }`}
                />
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setAnchor(anchorIdx + 1)}
          disabled={!canStepForward || loading}
          aria-label="Next period"
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Row 3: Period labels + scrollbar-style progress indicator ────── */}
      {!loading && (
        <div className="px-9">
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="text-gray-400">{windowItems[0]?.label ?? '—'}</span>
            <span className="font-medium text-gray-800">{anchor?.label ?? '—'}</span>
          </div>
          {/* Only show progress bar when there's more history than the window */}
          {items.length > effectiveWindow && (
            <div className="relative h-[3px] bg-gray-100 rounded-full overflow-hidden">
              <div
                className="absolute top-0 h-full bg-[#F9B103] rounded-full transition-all duration-150"
                style={{ left: `${progressLeft}%`, width: `${progressWidth}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
