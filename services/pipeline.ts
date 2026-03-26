/**
 * Full Analytics Pipeline
 *
 * Runs the complete data processing sequence:
 *   1. snapshots:generate  — pull raw data from source DB into snapshot tables,
 *                            including inline keyword quadrants, Word Analysis,
 *                            and Brand Splits snapshots
 *   2. availability:refresh — persist period availability for overview + domains
 *   3. metrics:generate    — compute domain metrics from snapshots
 *
 * Note: snapshots:classify is intentionally excluded. Classification logic
 * (including keyword quadrants, Word Analysis, Brand Splits, category health
 * tiers, and product performance groups) is now performed inline during
 * snapshot generation. The separate classifier script predates this and
 * writes only redundant tier-count columns that the metrics generator does
 * not read.
 *
 * Usage:
 *   npm run pipeline                        # all retailers, all months
 *   npm run pipeline -- --retailer=boots    # single retailer
 *   npm run pipeline -- --month=2026-03     # specific month
 *   npm run pipeline -- --snapshot-retailer-concurrency=4
 *   npm run pipeline -- --snapshot-sequential-domains
 *   npm run pipeline -- --force             # re-process even if snapshots are fresh
 *   npm run pipeline -- --dry-run           # preview without writing
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { generateSnapshots } from './snapshot-generator/generate-snapshots'
import { generateMetrics } from './domain-metrics-generator/generate-domain-metrics'
import { refreshDataAvailability } from './data-availability/refresh-data-availability'

interface PipelineOptions {
  retailer?: string
  month?: string
  force?: boolean
  dryRun?: boolean
  snapshotRetailerConcurrency?: number
  snapshotDomainParallel?: boolean
}

const parseArgs = (args: string[]): PipelineOptions => {
  const options: PipelineOptions = {}
  for (const arg of args) {
    if (arg.startsWith('--retailer=')) options.retailer = arg.split('=')[1]
    else if (arg.startsWith('--month=')) options.month = arg.split('=')[1]
    else if (arg === '--force') options.force = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg.startsWith('--snapshot-retailer-concurrency=')) {
      const value = parseInt(arg.split('=')[1], 10)
      if (!Number.isNaN(value)) options.snapshotRetailerConcurrency = Math.max(1, value)
    } else if (arg === '--snapshot-sequential-domains') {
      options.snapshotDomainParallel = false
    }
  }
  return options
}

const run = async (options: PipelineOptions): Promise<void> => {
  const startTime = Date.now()

  console.log('╔══════════════════════════════════════════╗')
  console.log('║         Analytics Pipeline               ║')
  console.log('╚══════════════════════════════════════════╝')
  if (options.retailer) console.log(`Retailer : ${options.retailer}`)
  if (options.month)    console.log(`Month    : ${options.month}`)
  if (options.force)    console.log(`Force    : yes`)
  if (options.dryRun)   console.log(`Dry run  : yes`)
  if (options.snapshotRetailerConcurrency) {
    console.log(`Snap RC  : ${options.snapshotRetailerConcurrency}`)
  }
  if (options.snapshotDomainParallel === false) {
    console.log('Snap dom : sequential')
  }
  console.log('')

  // ── Step 1: Generate snapshots ────────────────────────────────────────────
  console.log('── Step 1/3: Generate snapshots ─────────────────────────────────')
  const snapshotsStart = Date.now()
  const snapshotResults = await generateSnapshots({
    ...options,
    retailerConcurrency: options.snapshotRetailerConcurrency,
    domainParallel: options.snapshotDomainParallel,
  })
  const snapshotsElapsedSec = (Date.now() - snapshotsStart) / 1000
  const snapshotsDone = snapshotResults.filter(r => r.operation !== 'skipped').length
  const snapshotsSkipped = snapshotResults.filter(r => r.operation === 'skipped').length
  const snapshotsPerMinute = snapshotsElapsedSec > 0
    ? (snapshotsDone / (snapshotsElapsedSec / 60)).toFixed(1)
    : '0.0'
  console.log(
    `\n✓ Snapshots complete — ${snapshotsDone} written, ${snapshotsSkipped} skipped in ${snapshotsElapsedSec.toFixed(1)}s (${snapshotsPerMinute} snapshots/min)\n`
  )

  // ── Step 2: Refresh data availability ─────────────────────────────────────
  console.log('── Step 2/3: Refresh data availability ─────────────────────────')
  const availabilityStart = Date.now()
  const availabilitySummary = await refreshDataAvailability(options)
  const availabilityElapsedSec = (Date.now() - availabilityStart) / 1000
  const availabilityRowsPerSecond = availabilityElapsedSec > 0
    ? (availabilitySummary.upsertedCount / availabilityElapsedSec).toFixed(1)
    : '0.0'
  console.log(
    `\n✓ Availability complete — ${availabilitySummary.upsertedCount} rows across ${availabilitySummary.retailerCount} retailers in ${availabilityElapsedSec.toFixed(1)}s (${availabilityRowsPerSecond} rows/s)\n`
  )

  // ── Step 3: Generate domain metrics ──────────────────────────────────────
  console.log('── Step 3/3: Generate domain metrics ───────────────────────────')
  const metricsStart = Date.now()
  await generateMetrics(options)
  const metricsElapsedSec = (Date.now() - metricsStart) / 1000
  console.log(`\n✓ Metrics complete in ${metricsElapsedSec.toFixed(1)}s`)

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('')
  console.log('╔══════════════════════════════════════════╗')
  console.log(`║  Pipeline complete in ${elapsed.padStart(6)}s            ║`)
  console.log('╚══════════════════════════════════════════╝')
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2))
  run(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\nPipeline failed:', error)
      process.exit(1)
    })
}
