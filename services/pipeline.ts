/**
 * Full Analytics Pipeline
 *
 * Runs the complete data processing sequence:
 *   1. snapshots:generate  — pull raw data from source DB into snapshot tables
 *   2. metrics:generate    — compute domain metrics from snapshots
 *
 * Note: snapshots:classify is intentionally excluded. Classification logic
 * (keyword quadrants, category health tiers, product performance groups) is
 * now performed inline during snapshot generation. The separate classifier
 * script predates this and writes only redundant tier-count columns that the
 * metrics generator does not read.
 *
 * Usage:
 *   npm run pipeline                        # all retailers, all months
 *   npm run pipeline -- --retailer=boots    # single retailer
 *   npm run pipeline -- --month=2026-03     # specific month
 *   npm run pipeline -- --force             # re-process even if snapshots are fresh
 *   npm run pipeline -- --dry-run           # preview without writing
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { generateSnapshots } from './snapshot-generator/generate-snapshots'
import { generateMetrics } from './domain-metrics-generator/generate-domain-metrics'

interface PipelineOptions {
  retailer?: string
  month?: string
  force?: boolean
  dryRun?: boolean
}

const parseArgs = (args: string[]): PipelineOptions => {
  const options: PipelineOptions = {}
  for (const arg of args) {
    if (arg.startsWith('--retailer=')) options.retailer = arg.split('=')[1]
    else if (arg.startsWith('--month=')) options.month = arg.split('=')[1]
    else if (arg === '--force') options.force = true
    else if (arg === '--dry-run') options.dryRun = true
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
  console.log('')

  // ── Step 1: Generate snapshots ────────────────────────────────────────────
  console.log('── Step 1/2: Generate snapshots ─────────────────────────────────')
  const snapshotResults = await generateSnapshots(options)
  const snapshotsDone = snapshotResults.filter(r => r.operation !== 'skipped').length
  const snapshotsSkipped = snapshotResults.filter(r => r.operation === 'skipped').length
  console.log(`\n✓ Snapshots complete — ${snapshotsDone} written, ${snapshotsSkipped} skipped\n`)

  // ── Step 2: Generate domain metrics ──────────────────────────────────────
  console.log('── Step 2/2: Generate domain metrics ───────────────────────────')
  await generateMetrics(options)
  console.log('\n✓ Metrics complete')

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
