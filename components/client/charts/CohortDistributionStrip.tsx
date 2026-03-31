'use client'

import { useMemo, useState } from 'react'
import { COLORS } from '@/lib/colors'

type LabelEntry = {
  key: string
  anchor: number
  position: number
  label: string
  value?: string
}

export type CohortDistributionAggregate = {
  retailer: number | null
  cohortMedian: number | null
  cohortP25: number | null
  cohortP75: number | null
  cohortMin?: number | null
  cohortMax?: number | null
}

type StripPositioningMode = 'local-context' | 'global-median-aligned' | 'true-distribution'

interface CohortDistributionStripProps {
  aggregate: CohortDistributionAggregate | null
  distributionDeltaMax: number
  rowIndex: number
  valueFormatter: (value: number | null | undefined) => string
  chartHeightClass?: string
  emptyStateHeightClass?: string
  noDataMessage?: string
  minExtensionPercent?: number
  retailerBoundaryBufferPercent?: number
  hoverLabelMinGapPercent?: number
  hoverLabelEdgePaddingPercent?: number
  positioningMode?: StripPositioningMode
  globalQuartileBounds?: {
    lowestP25: number
    highestP75: number
  } | null
}

const clampPosition = (value: number, min = 2, max = 98): number => Math.max(min, Math.min(max, value))

const spreadLabelPositions = (entries: LabelEntry[], minGap: number, edgePadding: number): LabelEntry[] => {
  if (entries.length <= 1) return entries

  const sorted = [...entries]
    .map((entry) => ({
      ...entry,
      position: clampPosition(entry.anchor, edgePadding, 100 - edgePadding),
    }))
    .sort((a, b) => a.anchor - b.anchor)

  const minBound = edgePadding
  const maxBound = 100 - edgePadding

  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const left = sorted[index]
      const right = sorted[index + 1]
      const gap = right.position - left.position
      if (gap >= minGap) continue

      const push = (minGap - gap) / 2
      left.position -= push
      right.position += push
      changed = true
    }

    const first = sorted[0]
    if (first.position < minBound) {
      const shift = minBound - first.position
      for (const entry of sorted) entry.position += shift
      changed = true
    }

    const last = sorted[sorted.length - 1]
    if (last.position > maxBound) {
      const shift = last.position - maxBound
      for (const entry of sorted) entry.position -= shift
      changed = true
    }

    if (!changed) break
  }

  return sorted.map((entry) => ({
    ...entry,
    position: clampPosition(entry.position, minBound, maxBound),
  }))
}

export default function CohortDistributionStrip({
  aggregate,
  distributionDeltaMax,
  rowIndex,
  valueFormatter,
  chartHeightClass = 'h-[110px]',
  emptyStateHeightClass = 'h-[72px]',
  noDataMessage = 'No matching advertisers currently available.',
  minExtensionPercent = 6,
  retailerBoundaryBufferPercent = 4,
  hoverLabelMinGapPercent = 4,
  hoverLabelEdgePaddingPercent = 5,
  positioningMode = 'local-context',
  globalQuartileBounds = null,
}: CohortDistributionStripProps) {
  const [hovered, setHovered] = useState(false)

  const hasCoreData = !(
    aggregate?.cohortMedian === null
    && aggregate?.cohortP25 === null
    && aggregate?.cohortP75 === null
  )

  // Keep whiskers visually consistent: fixed whisker width plus a proportional
  // centre segment that expands only when "You" sits outside the middle 50% band.
  const chartMin = 2
  const chartMax = 98
  const fixedWhiskerWidth = minExtensionPercent
  const coreMinPos = chartMin + fixedWhiskerWidth
  const coreMaxPos = chartMax - fixedWhiskerWidth

  const p25ValueRaw = aggregate?.cohortP25 ?? null
  const p75ValueRaw = aggregate?.cohortP75 ?? null
  const youValue = aggregate?.retailer ?? null
  const medianValueRaw = aggregate?.cohortMedian ?? null

  const quartileValues = useMemo(() => {
    let p25 = p25ValueRaw
    let median = medianValueRaw
    let p75 = p75ValueRaw

    if (p25 !== null && p75 !== null && p25 > p75) {
      const swap = p25
      p25 = p75
      p75 = swap
    }

    if (median !== null && p25 !== null && median < p25) median = p25
    if (median !== null && p75 !== null && median > p75) median = p75

    return { p25, median, p75 }
  }, [medianValueRaw, p25ValueRaw, p75ValueRaw])

  const p25Value = quartileValues.p25
  const medianValue = quartileValues.median
  const p75Value = quartileValues.p75

  const useGlobalMedianAligned = positioningMode === 'global-median-aligned' && globalQuartileBounds !== null
  const useTrueDistribution = positioningMode === 'true-distribution'

  const trueDistributionDomain = useMemo(() => {
    if (!useTrueDistribution) return null
    const values = [
      aggregate?.cohortMin,
      aggregate?.cohortP25,
      aggregate?.cohortMedian,
      aggregate?.cohortP75,
      aggregate?.cohortMax,
      aggregate?.retailer,
    ].filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))

    if (values.length < 2) return null

    const min = Math.min(...values)
    const max = Math.max(...values)
    if (max === min) return { min, max: min + 1 }
    return { min, max }
  }, [
    aggregate?.cohortMax,
    aggregate?.cohortMedian,
    aggregate?.cohortMin,
    aggregate?.cohortP25,
    aggregate?.cohortP75,
    aggregate?.retailer,
    useTrueDistribution,
  ])

  const coreDomain = useMemo(() => {
    if (useTrueDistribution && trueDistributionDomain !== null) {
      return trueDistributionDomain
    }

    if (useGlobalMedianAligned && globalQuartileBounds !== null) {
      const lower = Math.min(globalQuartileBounds.lowestP25, youValue ?? globalQuartileBounds.lowestP25)
      const upper = Math.max(globalQuartileBounds.highestP75, youValue ?? globalQuartileBounds.highestP75)
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null
      if (upper === lower) return { min: lower, max: lower + 1 }
      return { min: lower, max: upper }
    }

    if (p25Value === null || p75Value === null) return null
    const lower = Math.min(p25Value, youValue ?? p25Value)
    const upper = Math.max(p75Value, youValue ?? p75Value)
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null
    if (upper === lower) return { min: lower, max: lower + 1 }
    return { min: lower, max: upper }
  }, [
    globalQuartileBounds,
    p25Value,
    p75Value,
    trueDistributionDomain,
    useGlobalMedianAligned,
    useTrueDistribution,
    youValue,
  ])

  const toCorePosition = (value: number | null | undefined): number | null => {
    if (value === null || value === undefined || coreDomain === null) return null

    if (useTrueDistribution) {
      const ratio = (value - coreDomain.min) / (coreDomain.max - coreDomain.min)
      return clampPosition(chartMin + (chartMax - chartMin) * ratio, chartMin, chartMax)
    }

    if (useGlobalMedianAligned) {
      const ratio = (value - coreDomain.min) / (coreDomain.max - coreDomain.min)
      return clampPosition(coreMinPos + (coreMaxPos - coreMinPos) * ratio, coreMinPos, coreMaxPos)
    }

    const ratio = (value - coreDomain.min) / (coreDomain.max - coreDomain.min)
    return clampPosition(coreMinPos + (coreMaxPos - coreMinPos) * ratio, coreMinPos, coreMaxPos)
  }

  const p25 = toCorePosition(p25Value)
  const p75 = toCorePosition(p75Value)
  const median = useGlobalMedianAligned && !useTrueDistribution && medianValue !== null ? 50 : toCorePosition(medianValue)
  const you = toCorePosition(youValue)

  const trueMinPos = useTrueDistribution ? toCorePosition(aggregate?.cohortMin ?? null) : null
  const trueMaxPos = useTrueDistribution ? toCorePosition(aggregate?.cohortMax ?? null) : null

  const hasMinExtension = aggregate?.cohortMin !== null && aggregate?.cohortMin !== undefined && p25 !== null
  const hasMaxExtension = aggregate?.cohortMax !== null && aggregate?.cohortMax !== undefined && p75 !== null
  const middleBandWidth = p25 !== null && p75 !== null ? Math.max(2, Math.abs(p75 - p25)) : null

  const minDisplayPos = useMemo(() => {
    if (useTrueDistribution) return trueMinPos
    if (!hasMinExtension || p25 === null) return null
    const basePosition = p25 - fixedWhiskerWidth
    return clampPosition(basePosition, chartMin, chartMax)
  }, [chartMax, chartMin, fixedWhiskerWidth, hasMinExtension, p25, trueMinPos, useTrueDistribution])

  const maxDisplayPos = useMemo(() => {
    if (useTrueDistribution) return trueMaxPos
    if (!hasMaxExtension || p75 === null) return null
    const basePosition = p75 + fixedWhiskerWidth
    return clampPosition(basePosition, chartMin, chartMax)
  }, [chartMax, chartMin, fixedWhiskerWidth, hasMaxExtension, p75, trueMaxPos, useTrueDistribution])

  const hoverLabels = useMemo(() => {
    if (!hovered) return []

    const entries: LabelEntry[] = []

    if (p25 !== null) {
      entries.push({
        key: 'lower-25',
        anchor: p25,
        position: p25,
        label: 'Lower 25%',
        value: valueFormatter(aggregate?.cohortP25 ?? null),
      })
    }

    if (p75 !== null) {
      entries.push({
        key: 'upper-25',
        anchor: p75,
        position: p75,
        label: 'Upper 25%',
        value: valueFormatter(aggregate?.cohortP75 ?? null),
      })
    }

    if (median !== null) {
      entries.push({
        key: 'average',
        anchor: median,
        position: median,
        label: 'Average (median)',
        value: valueFormatter(aggregate?.cohortMedian ?? null),
      })
    }

    return spreadLabelPositions(entries, hoverLabelMinGapPercent, hoverLabelEdgePaddingPercent)
  }, [
    aggregate?.cohortMedian,
    aggregate?.cohortP25,
    aggregate?.cohortP75,
    hoverLabelMinGapPercent,
    hovered,
    maxDisplayPos,
    median,
    minDisplayPos,
    p25,
    p75,
    hoverLabelEdgePaddingPercent,
    valueFormatter,
  ])

  const endpointLabels = useMemo(() => {
    if (!hovered) return [] as LabelEntry[]
    const entries: LabelEntry[] = []
    if (minDisplayPos !== null) {
      entries.push({
        key: 'lowest',
        anchor: minDisplayPos,
        position: minDisplayPos,
        label: 'Lowest',
        value: valueFormatter(aggregate?.cohortMin ?? null),
      })
    }
    if (maxDisplayPos !== null) {
      entries.push({
        key: 'highest',
        anchor: maxDisplayPos,
        position: maxDisplayPos,
        label: 'Highest',
        value: valueFormatter(aggregate?.cohortMax ?? null),
      })
    }
    return entries
  }, [aggregate?.cohortMax, aggregate?.cohortMin, hovered, maxDisplayPos, minDisplayPos, valueFormatter])

  if (!hasCoreData) {
    return (
      <div className={`relative ${emptyStateHeightClass} flex-1 flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-4 text-xs text-slate-600`}>
        {noDataMessage}
      </div>
    )
  }

  return (
    <div
      className={`relative ${chartHeightClass} flex-1`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute inset-y-0 w-px bg-slate-100" style={{ left: '50%' }} />
      {p25 !== null && p75 !== null && (
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-slate-300"
          style={{ left: `${Math.min(p25, p75)}%`, width: `${Math.max(2, Math.abs(p75 - p25))}%` }}
          title="Middle 50%"
        />
      )}

      {hovered && minDisplayPos !== null && p25 !== null && (p25 - minDisplayPos) >= 6 && (
        <div
          className="absolute -translate-y-1/2"
          style={{ left: `${Math.min(minDisplayPos, p25)}%`, width: `${Math.max(2, Math.abs(p25 - minDisplayPos))}%`, top: 'calc(50% - 42px)' }}
        >
          <div className="relative h-3">
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-600" />
            <div className="absolute left-0 top-1/2 h-2 border-l border-slate-600" />
            <div className="absolute right-0 top-1/2 h-2 border-r border-slate-600" />
          </div>
          <span className="absolute left-1/2 -top-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-700">
            Lower 25%
          </span>
        </div>
      )}

      {hovered && p25 !== null && p75 !== null && middleBandWidth !== null && middleBandWidth >= 12 && (
        <div
          className="absolute -translate-y-1/2"
          style={{ left: `${Math.min(p25, p75)}%`, width: `${Math.max(2, Math.abs(p75 - p25))}%`, top: 'calc(50% - 42px)' }}
        >
          <div className="relative h-3">
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-600" />
            <div className="absolute left-0 top-1/2 h-2 border-l border-slate-600" />
            <div className="absolute right-0 top-1/2 h-2 border-r border-slate-600" />
          </div>
          <span className="absolute -top-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-700" style={{ left: `${median}%` }}>
            Middle 50%
          </span>
        </div>
      )}

      {hovered && p75 !== null && maxDisplayPos !== null && (maxDisplayPos - p75) >= 6 && (
        <div
          className="absolute -translate-y-1/2"
          style={{ left: `${Math.min(p75, maxDisplayPos)}%`, width: `${Math.max(2, Math.abs(maxDisplayPos - p75))}%`, top: 'calc(50% - 42px)' }}
        >
          <div className="relative h-3">
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-600" />
            <div className="absolute left-0 top-1/2 h-2 border-l border-slate-600" />
            <div className="absolute right-0 top-1/2 h-2 border-r border-slate-600" />
          </div>
          <span className="absolute left-1/2 -top-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-700">
            Upper 25%
          </span>
        </div>
      )}

      {minDisplayPos !== null && p25 !== null && (
        <>
          <div
            className="absolute top-1/2 h-0 -translate-y-1/2 border-t border-dashed border-slate-500"
            style={{ left: `${minDisplayPos}%`, width: `${Math.max(0, p25 - minDisplayPos)}%` }}
          />
          <div
            className="absolute top-1/2 h-0 w-0 -translate-x-full -translate-y-1/2 border-y-[5px] border-y-transparent border-r-[8px] border-r-slate-600"
            style={{ left: `${minDisplayPos}%` }}
            title={`Lowest: ${valueFormatter(aggregate?.cohortMin ?? null)}`}
          />
        </>
      )}

      {maxDisplayPos !== null && p75 !== null && (
        <>
          <div
            className="absolute top-1/2 h-0 -translate-y-1/2 border-t border-dashed border-slate-500"
            style={{ left: `${p75}%`, width: `${Math.max(0, maxDisplayPos - p75)}%` }}
          />
          <div
            className="absolute top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-y-transparent border-l-[8px] border-l-slate-600"
            style={{ left: `${maxDisplayPos}%` }}
            title={`Highest: ${valueFormatter(aggregate?.cohortMax ?? null)}`}
          />
        </>
      )}

      {p25 !== null && (
        <div
          className="absolute top-1/2 h-6 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded bg-slate-500"
          style={{ left: `${p25}%` }}
          title={`Lower 25%: ${valueFormatter(aggregate?.cohortP25 ?? null)}`}
        />
      )}

      {p75 !== null && (
        <div
          className="absolute top-1/2 h-6 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded bg-slate-500"
          style={{ left: `${p75}%` }}
          title={`Upper 25%: ${valueFormatter(aggregate?.cohortP75 ?? null)}`}
        />
      )}

      {median !== null && (
        <div
          className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded"
          style={{ left: `${median}%`, backgroundColor: COLORS.success }}
          title={`Average (median): ${valueFormatter(aggregate?.cohortMedian ?? null)}`}
        >
          <span className="absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.success }}>
            {rowIndex === 0
              ? `Average ${valueFormatter(aggregate?.cohortMedian ?? null)}`
              : valueFormatter(aggregate?.cohortMedian ?? null)}
          </span>
        </div>
      )}

      {you !== null && (
        <div
          className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded"
          style={{ left: `${you}%`, backgroundColor: COLORS.warning }}
          title={`You: ${valueFormatter(aggregate?.retailer ?? null)}`}
        >
          <span className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ color: COLORS.warningDark }}>
            {rowIndex === 0
              ? `You ${valueFormatter(aggregate?.retailer ?? null)}`
              : valueFormatter(aggregate?.retailer ?? null)}
          </span>
        </div>
      )}

      {hoverLabels.map((entry) => (
        <div
          key={`cohort-strip-hover-${entry.key}`}
          className="absolute top-[calc(50%+20px)] -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-center text-[10px] leading-tight text-white"
          style={{ left: `${entry.position}%` }}
        >
          {(entry.key === 'lower-25' || entry.key === 'upper-25') ? (
            <span className="block">{entry.value}</span>
          ) : (
            <>
              <span className="block">{entry.value ? `${entry.label}:` : entry.label}</span>
              {entry.value && <span className="block">{entry.value}</span>}
            </>
          )}
        </div>
      ))}

      {endpointLabels.map((entry) => (
        <div
          key={`cohort-strip-endpoint-${entry.key}`}
          className="absolute top-[calc(50%+20px)] -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-center text-[10px] leading-tight text-white"
          style={{ left: `${entry.position}%` }}
        >
          <span className="block">{`${entry.label}:`}</span>
          {entry.value && <span className="block">{entry.value}</span>}
        </div>
      ))}
    </div>
  )
}