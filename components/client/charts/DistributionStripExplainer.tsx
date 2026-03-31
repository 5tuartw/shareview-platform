'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type RetailerPoint = {
  id: string
  label: string
  value: number
}

type StoryStep = {
  caption: string
}

const STORY_STEPS: StoryStep[] = [
  { caption: 'We start with our data in no particular order.' },
  { caption: 'Next, we reorder the values from highest to lowest.' },
  { caption: 'Then we position each value on a scaled line.' },
  { caption: 'We label the lowest, middle and highest values.' },
  { caption: 'And mark out the lower 25% and upper 25%.' },
  { caption: 'Finally we group together the middle 50%.' },
  { caption: 'Now you can easily see how your performance compares to others\u2019.' },
]

const RETAILERS: RetailerPoint[] = [
  { id: 'a', label: 'Retailer A', value: 106331 },
  { id: 'b', label: 'Retailer B', value: 93811 },
  { id: 'c', label: 'Retailer C', value: 81240 },
  { id: 'd', label: 'Retailer D', value: 72115 },
  { id: 'e', label: 'Retailer E', value: 66058 },
  { id: 'f', label: 'Retailer F', value: 57490 },
  { id: 'g', label: 'Retailer G', value: 52831 },
  { id: 'h', label: 'Retailer H', value: 41110 },
  { id: 'i', label: 'Retailer I', value: 25160 },
  { id: 'j', label: 'Retailer J', value: 12488 },
  { id: 'k', label: 'Retailer K', value: 9811 },
]

// Intentionally not sorted by earnings so slide 1 shows a jumbled order,
// and slide 2 can visibly reorder rows.
const INITIAL_TABLE_ORDER = ['a', 'f', 'c', 'i', 'b', 'k', 'e', 'h', 'd', 'j', 'g']
const YOU_ID = 'c'

const ROW_COLOUR_STYLES = [
  { text: 'text-rose-700', lineHex: '#e11d48' },
  { text: 'text-orange-700', lineHex: '#ea580c' },
  { text: 'text-amber-700', lineHex: '#d97706' },
  { text: 'text-yellow-700', lineHex: '#a16207' },
  { text: 'text-lime-700', lineHex: '#4d7c0f' },
  { text: 'text-emerald-700', lineHex: '#047857' },
  { text: 'text-teal-700', lineHex: '#0f766e' },
  { text: 'text-cyan-700', lineHex: '#0e7490' },
  { text: 'text-sky-700', lineHex: '#0369a1' },
  { text: 'text-indigo-700', lineHex: '#4338ca' },
  { text: 'text-violet-700', lineHex: '#7c3aed' },
]

const TEAL_HEX = '#14B8A6'
const BLACK_HEX = '#000000'
const WARNING_HEX = '#F59E0B'

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)

// Phase delays (ms) within each step.
// Phase 0 is immediate on step entry; each entry triggers the next phase.
const STEP_PHASE_DELAYS: number[][] = [
  [],                        // Step 0: static
  [600],                     // Step 1: 600ms → sort
  [500, 600, 600, 500],      // Step 2: 500ms → markers, +600ms → line, +600ms → plot on line, +500ms → labels
  [500, 900, 900],           // Step 3: 500ms → lowest, +900ms → middle, +900ms → highest
  [500, 700],                // Step 4: 500ms → lower bracket, +700ms → upper bracket
  [500],                     // Step 5: 500ms → strip + colour change + middle bracket
  [500, 700],                // Step 6: 500ms → pulse you, +700ms → highlight rectangle
]

// How long (ms) to stay on each step before auto-advancing.
const STEP_DURATIONS = [3500, 2500, 4500, 5000, 3200, 3200, 4500]

export default function DistributionStripExplainer() {
  const [stepIndex, setStepIndex] = useState(0)
  const [stepPhase, setStepPhase] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Phase timer: advance stepPhase based on STEP_PHASE_DELAYS
  useEffect(() => {
    setStepPhase(0)
    const delays = STEP_PHASE_DELAYS[stepIndex] || []
    const timers: number[] = []
    let elapsed = 0
    delays.forEach((delay, i) => {
      elapsed += delay
      timers.push(window.setTimeout(() => setStepPhase(i + 1), elapsed))
    })
    return () => timers.forEach((t) => clearTimeout(t))
  }, [stepIndex])

  // Auto-advance timer (per-step duration)
  useEffect(() => {
    if (!isPlaying) return
    const duration = STEP_DURATIONS[stepIndex]
    const timer = window.setTimeout(() => {
      setStepIndex((current) => (current >= STORY_STEPS.length - 1 ? 0 : current + 1))
    }, duration)
    return () => clearTimeout(timer)
  }, [isPlaying, stepIndex])

  const retailerById = useMemo(
    () => Object.fromEntries(RETAILERS.map((r) => [r.id, r])),
    [],
  )

  const initialTableRetailers = useMemo(
    () => INITIAL_TABLE_ORDER.map((id) => retailerById[id]).filter((r): r is RetailerPoint => Boolean(r)),
    [retailerById],
  )

  const sortedRetailers = useMemo(
    () => [...RETAILERS].sort((a, b) => b.value - a.value),
    [],
  )

  // Colour identity is tied to the initial unordered view so step 0 appears
  // as a clean red→violet sequence, then looks jumbled once rows are sorted.
  const retailerColourById = useMemo(
    () => Object.fromEntries(initialTableRetailers.map((r, i) => [r.id, ROW_COLOUR_STYLES[i % ROW_COLOUR_STYLES.length]])),
    [initialTableRetailers],
  )

  // ── Derived animation flags ──────────────────────────────────────────
  const showSorted   = stepIndex > 1 || (stepIndex === 1 && stepPhase >= 1)
  const showMarkers  = stepIndex > 2 || (stepIndex === 2 && stepPhase >= 1)
  const showLine     = stepIndex > 2 || (stepIndex === 2 && stepPhase >= 2)
  const plotOnLine   = stepIndex > 2 || (stepIndex === 2 && stepPhase >= 3)
  const showLetters  = stepIndex > 2 || (stepIndex === 2 && stepPhase >= 4)

  // Step 3: lowest → middle → highest
  const showLowestLabel  = stepIndex > 3 || (stepIndex === 3 && stepPhase >= 1)
  const showMedianLabel  = stepIndex > 3 || (stepIndex === 3 && stepPhase >= 2)
  const showHighestLabel = stepIndex > 3 || (stepIndex === 3 && stepPhase >= 3)
  const pulseLowest  = stepIndex === 3 && stepPhase === 1
  const pulseMedian  = stepIndex === 3 && stepPhase === 2
  const pulseHighest = stepIndex === 3 && stepPhase === 3

  const showLowerBracket = stepIndex > 4 || (stepIndex === 4 && stepPhase >= 1)
  const showUpperBracket = stepIndex > 4 || (stepIndex === 4 && stepPhase >= 2)

  const showStripAndRecolour = stepIndex > 5 || (stepIndex === 5 && stepPhase >= 1)
  const showMiddleBracket    = showStripAndRecolour

  const showYouLabel     = stepIndex >= 6
  const pulseYou         = stepIndex === 6 && stepPhase >= 1
  const showYouHighlight = stepIndex === 6 && stepPhase >= 2

  const tableRetailers = showSorted ? sortedRetailers : initialTableRetailers

  // Map retailer ID → its current index in the visible table, so pre-plot
  // markers sit beside the correct row.
  const tableIndexById = useMemo(
    () => Object.fromEntries(tableRetailers.map((r, i) => [r.id, i])),
    [tableRetailers],
  )

  const valuesAsc = useMemo(
    () => [...RETAILERS].map((entry) => entry.value).sort((left, right) => left - right),
    [],
  )

  const minValue = valuesAsc[0]
  const maxValue = valuesAsc[valuesAsc.length - 1]
  const medianValue = valuesAsc[Math.floor(valuesAsc.length / 2)]
  const p25Value = valuesAsc[Math.floor((valuesAsc.length - 1) * 0.25)]
  const p75Value = valuesAsc[Math.floor((valuesAsc.length - 1) * 0.75)]

  const toLineX = (value: number): number => {
    if (maxValue === minValue) return 50
    return 4 + ((value - minValue) / (maxValue - minValue)) * 92
  }

  const p25X = toLineX(p25Value)
  const p75X = toLineX(p75Value)

  const badgeClass = 'absolute top-[62%] -translate-x-1/2 whitespace-nowrap rounded bg-slate-950 px-2 py-1 text-center text-[11px] font-semibold leading-tight text-white'

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">How to read this chart</p>
        <p className="text-sm font-medium text-slate-900">Distribution strip walkthrough</p>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-stretch gap-4">
          {/* Table */}
          <div className="shrink-0" style={{ width: 360 }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pb-1 text-center font-medium">Retailer</th>
                  <th className="pb-1 text-center font-medium">Monthly earnings</th>
                </tr>
              </thead>
              <motion.tbody layout>
                {tableRetailers.map((retailer) => {
                  const colour = retailerColourById[retailer.id]
                  const displayLabel = retailer.id === YOU_ID ? 'Retailer C (You)' : retailer.label
                  return (
                    <motion.tr
                      key={retailer.id}
                      layout
                      transition={{ duration: 0.45 }}
                      className="border-t border-slate-100"
                    >
                      <td className={`py-1.5 text-center font-medium ${colour.text}`}>{displayLabel}</td>
                      <td className={`py-1.5 text-center font-semibold ${colour.text}`}>{formatMoney(retailer.value)}</td>
                    </motion.tr>
                  )
                })}
              </motion.tbody>
            </table>
          </div>

          {/* Chart area */}
          <div className="relative min-h-[260px] flex-1">
            {/* Nav + Caption */}
            <div className="absolute left-2 top-0 right-2">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col items-center gap-1">
                <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
                  <button
                    type="button"
                    aria-label="Previous step"
                    onClick={() => { setIsPlaying(false); setStepIndex((c) => (c === 0 ? STORY_STEPS.length - 1 : c - 1)) }}
                    className="rounded p-1 text-slate-600 hover:bg-slate-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button
                    type="button"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    onClick={() => setIsPlaying((c) => !c)}
                    className="rounded p-1 text-slate-600 hover:bg-slate-100"
                  >
                    {isPlaying ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Next step"
                    onClick={() => { setIsPlaying(false); setStepIndex((c) => (c + 1) % STORY_STEPS.length) }}
                    className="rounded p-1 text-slate-600 hover:bg-slate-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {STORY_STEPS.map((_step, index) => (
                    <button
                      key={`dot-${index}`}
                      type="button"
                      onClick={() => {
                        setIsPlaying(false)
                        setStepIndex(index)
                      }}
                      aria-label={`Go to step ${index + 1}`}
                      className={`h-2 w-2 rounded-full ${index === stepIndex ? 'bg-slate-800' : 'bg-slate-300 hover:bg-slate-400'}`}
                    />
                  ))}
                </div>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`caption-${stepIndex}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm font-semibold text-black"
                  >
                    {STORY_STEPS[stepIndex].caption}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* Scaled line + tick marks */}
            {showLine && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="absolute left-0 right-0 top-1/2 border-t border-dashed border-slate-500"
                />
                {Array.from({ length: Math.floor(maxValue / 20000) + 1 }, (_, i) => i * 20000)
                  .filter((v) => v > 0 && v <= maxValue * 1.15)
                  .map((v) => {
                    const x = toLineX(v)
                    return (
                      <motion.div
                        key={`tick-${v}`}
                        className="absolute"
                        style={{ left: `${x}%`, top: '50%' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                      >
                        <div className="absolute left-0 top-0 h-2 w-px bg-slate-400" />
                        <span className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[9px] text-slate-500">
                          £{v / 1000}k
                        </span>
                      </motion.div>
                    )
                  })}
              </>
            )}

            {/* Grey IQR strip (step 5+) */}
            {showStripAndRecolour && (
              <motion.div
                initial={{ opacity: 0, scaleY: 0.7 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ duration: 0.4 }}
                className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-slate-300"
                style={{ left: `${Math.min(p25X, p75X)}%`, width: `${Math.max(2, Math.abs(p75X - p25X))}%` }}
              />
            )}

            {/* Markers */}
            {showMarkers && sortedRetailers.map((retailer, index) => {
              const colour = retailerColourById[retailer.id]
              const tableIndex = tableIndexById[retailer.id] ?? index
              const headerPct = 5
              const rowY = headerPct + ((tableIndex + 0.5) / sortedRetailers.length) * (100 - headerPct)
              const x = plotOnLine ? toLineX(retailer.value) : -2
              const y = plotOnLine ? 50 : rowY
              const isYou = retailer.id === YOU_ID
              const isLowest = retailer.value === minValue
              const isHighest = retailer.value === maxValue
              const isMedian = retailer.value === medianValue
              const isP25 = retailer.value === p25Value
              const isP75 = retailer.value === p75Value
              const shortLetter = isYou ? 'You' : (retailer.label.split(' ').pop() ?? retailer.id.toUpperCase())

              // Step 5+: keep only key markers visible.
              // lowest/highest/p25/p75 → black, median → teal, you → original, all others → fade out.
              let markerColour = colour.lineHex
              let markerOpacity = 1
              if (showStripAndRecolour) {
                if (isYou) {
                  markerColour = WARNING_HEX
                } else if (isMedian) {
                  markerColour = TEAL_HEX
                } else if (isLowest || isHighest || isP25 || isP75) {
                  markerColour = BLACK_HEX
                } else {
                  markerOpacity = 0
                }
              }

              const shouldPulse =
                (pulseLowest && isLowest) ||
                (pulseHighest && isHighest) ||
                (pulseMedian && isMedian) ||
                (pulseYou && isYou)

              return (
                <motion.div
                  key={`point-${retailer.id}`}
                  className="absolute"
                  initial={{ opacity: 0 }}
                  animate={{
                    left: `${x}%`,
                    top: `${y}%`,
                    opacity: markerOpacity,
                  }}
                  transition={{ duration: 0.55, delay: plotOnLine ? index * 0.03 : 0 }}
                >
                  <motion.div
                    className="-translate-x-1/2 -translate-y-1/2 rounded"
                    animate={{
                      width: plotOnLine ? 3 : 14,
                      height: plotOnLine ? 28 : 3,
                      backgroundColor: markerColour,
                      scale: shouldPulse ? [1, 1.6, 1] : 1,
                    }}
                    transition={
                      shouldPulse
                        ? pulseYou
                          ? { duration: 0.5, repeat: 1, repeatDelay: 0.15 }
                          : { duration: 0.5 }
                        : { duration: 0.45 }
                    }
                  />

                  {/* Letter labels above plotted markers (step 2 phase 3+, fade out at step 5+ except You) */}
                  {showLetters && plotOnLine && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: showStripAndRecolour && (!isYou || showYouLabel) ? 0 : 1 }}
                      transition={{ duration: 0.3 }}
                      className={`absolute left-1/2 -top-8 -translate-x-1/2 -ml-0.5 whitespace-nowrap text-[11px] font-semibold ${colour.text}`}
                    >
                      {shortLetter}
                    </motion.span>
                  )}

                  {/* You label on the line (step 6+) */}
                  {showYouLabel && isYou && plotOnLine && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute left-1/2 -top-8 -translate-x-1/2 -ml-0.5 whitespace-nowrap text-[11px] font-semibold text-amber-700"
                    >
                      You {formatMoney(retailer.value)}
                    </motion.span>
                  )}

                  {/* Highlight rectangle around You marker + label (step 6 phase 2) */}
                  {showYouHighlight && isYou && plotOnLine && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4 }}
                      className="absolute left-1/2 -translate-x-1/2 pointer-events-none rounded-lg border-2 border-amber-400"
                      style={{ top: -36, width: 100, height: 66, marginLeft: 0 }}
                    />
                  )}
                </motion.div>
              )
            })}

            {/* Key labels: Lowest (step 3 phase 1+) */}
            {showLowestLabel && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={badgeClass}
                style={{ left: `${toLineX(minValue)}%` }}
              >
                <span className="block">Lowest:</span>
                <span className="block">{formatMoney(minValue)}</span>
              </motion.div>
            )}

            {/* Key labels: Middle / Median (step 3 phase 2+) */}
            {showMedianLabel && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={badgeClass}
                style={{ left: `${toLineX(medianValue)}%` }}
              >
                <span className="block">Average (median):</span>
                <span className="block">{formatMoney(medianValue)}</span>
              </motion.div>
            )}

            {/* Key labels: Highest (step 3 phase 3+) */}
            {showHighestLabel && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={badgeClass}
                style={{ left: `${toLineX(maxValue)}%` }}
              >
                <span className="block">Highest:</span>
                <span className="block">{formatMoney(maxValue)}</span>
              </motion.div>
            )}

            {/* Bracket: Lower 25% (step 4 phase 1+) */}
            {showLowerBracket && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="absolute -translate-y-1/2"
                style={{ left: `${toLineX(minValue)}%`, width: `${Math.max(2, p25X - toLineX(minValue))}%`, top: 'calc(50% - 42px)' }}
              >
                <div className="relative h-3">
                  <div className="absolute inset-x-0 top-1/2 border-t border-slate-600" />
                  <div className="absolute left-0 top-1/2 h-2 border-l border-slate-600" />
                  <div className="absolute right-0 top-1/2 h-2 border-r border-slate-600" />
                </div>
                <span className="absolute left-1/2 -top-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-700">Lower 25%</span>
              </motion.div>
            )}

            {/* Bracket: Upper 25% (step 4 phase 2+) */}
            {showUpperBracket && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="absolute -translate-y-1/2"
                style={{ left: `${p75X}%`, width: `${Math.max(2, toLineX(maxValue) - p75X)}%`, top: 'calc(50% - 42px)' }}
              >
                <div className="relative h-3">
                  <div className="absolute inset-x-0 top-1/2 border-t border-slate-600" />
                  <div className="absolute left-0 top-1/2 h-2 border-l border-slate-600" />
                  <div className="absolute right-0 top-1/2 h-2 border-r border-slate-600" />
                </div>
                <span className="absolute left-1/2 -top-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-700">Upper 25%</span>
              </motion.div>
            )}

            {/* P25 value label (step 5+) */}
            {showStripAndRecolour && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={badgeClass}
                style={{ left: `${p25X}%` }}
              >
                <span className="block">{formatMoney(p25Value)}</span>
              </motion.div>
            )}

            {/* P75 value label (step 5+) */}
            {showStripAndRecolour && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={badgeClass}
                style={{ left: `${p75X}%` }}
              >
                <span className="block">{formatMoney(p75Value)}</span>
              </motion.div>
            )}

            {/* Bracket: Middle 50% (step 5 phase 1+) */}
            {showMiddleBracket && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="absolute -translate-y-1/2"
                style={{ left: `${Math.min(p25X, p75X)}%`, width: `${Math.max(2, Math.abs(p75X - p25X))}%`, top: 'calc(50% - 42px)' }}
              >
                <div className="relative h-3">
                  <div className="absolute inset-x-0 top-1/2 border-t border-slate-600" />
                  <div className="absolute left-0 top-1/2 h-2 border-l border-slate-600" />
                  <div className="absolute right-0 top-1/2 h-2 border-r border-slate-600" />
                </div>
                <span className="absolute left-1/2 -top-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-700">Middle 50%</span>
              </motion.div>
            )}
          </div>
        </div>
      </div>


    </div>
  )
}
