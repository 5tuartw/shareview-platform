import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { spawn } from 'child_process'

interface BenchmarkOptions {
  runs: number
  retries: number
  month?: string
  retailer?: string
  force: boolean
  outputDir: string
}

interface Profile {
  id: string
  description: string
  extraArgs: string[]
}

interface RunMetrics {
  snapshotsSec: number | null
  availabilitySec: number | null
  metricsSec: number | null
  totalSec: number | null
  snapshotsWritten: number | null
}

interface RunResult {
  profileId: string
  runNumber: number
  attempt: number
  success: boolean
  command: string
  startedAt: string
  finishedAt: string
  durationMs: number
  exitCode: number
  metrics: RunMetrics
  errorSummary?: string
}

const profiles: Profile[] = [
  {
    id: 'default',
    description: 'Pipeline defaults (domain parallel on, environment default retailer concurrency)',
    extraArgs: [],
  },
  {
    id: 'retailer_concurrency_2',
    description: 'Explicit snapshot retailer concurrency = 2',
    extraArgs: ['--snapshot-retailer-concurrency=2'],
  },
  {
    id: 'sequential_domains',
    description: 'Disable snapshot domain parallelism',
    extraArgs: ['--snapshot-sequential-domains'],
  },
  {
    id: 'retailer_concurrency_4',
    description: 'Increase snapshot retailer concurrency to 4',
    extraArgs: ['--snapshot-retailer-concurrency=4'],
  },
]

const parseArgs = (args: string[]): BenchmarkOptions => {
  const options: BenchmarkOptions = {
    runs: 3,
    retries: 2,
    force: true,
    outputDir: '/tmp',
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg.startsWith('--runs=')) {
      options.runs = Math.max(1, parseInt(arg.split('=')[1], 10) || 3)
    } else if (arg === '--runs' && i + 1 < args.length) {
      options.runs = Math.max(1, parseInt(args[i + 1], 10) || 3)
      i += 1
    } else if (arg.startsWith('--retries=')) {
      options.retries = Math.max(0, parseInt(arg.split('=')[1], 10) || 2)
    } else if (arg === '--retries' && i + 1 < args.length) {
      options.retries = Math.max(0, parseInt(args[i + 1], 10) || 2)
      i += 1
    } else if (arg.startsWith('--month=')) {
      options.month = arg.split('=')[1]
    } else if (arg === '--month' && i + 1 < args.length) {
      options.month = args[i + 1]
      i += 1
    } else if (arg.startsWith('--retailer=')) {
      options.retailer = arg.split('=')[1]
    } else if (arg === '--retailer' && i + 1 < args.length) {
      options.retailer = args[i + 1]
      i += 1
    } else if (arg === '--no-force') {
      options.force = false
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.split('=')[1]
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      options.outputDir = args[i + 1]
      i += 1
    }
  }

  return options
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

const parseMetrics = (output: string): RunMetrics => {
  const snapshotsMatch = output.match(/Snapshots complete .* in ([0-9]+(?:\.[0-9]+)?)s/)
  const availabilityMatch = output.match(/Availability complete .* in ([0-9]+(?:\.[0-9]+)?)s/)
  const metricsMatch = output.match(/Metrics complete in ([0-9]+(?:\.[0-9]+)?)s/)
  const totalMatch = output.match(/Pipeline complete in\s+([0-9]+(?:\.[0-9]+)?)s/)
  const snapshotsWrittenMatch = output.match(/Snapshots complete — ([0-9]+) written/)

  return {
    snapshotsSec: snapshotsMatch ? Number(snapshotsMatch[1]) : null,
    availabilitySec: availabilityMatch ? Number(availabilityMatch[1]) : null,
    metricsSec: metricsMatch ? Number(metricsMatch[1]) : null,
    totalSec: totalMatch ? Number(totalMatch[1]) : null,
    snapshotsWritten: snapshotsWrittenMatch ? Number(snapshotsWrittenMatch[1]) : null,
  }
}

const extractErrorSummary = (output: string): string => {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const likelyError = lines.reverse().find((line) =>
    line.includes('Pipeline failed:') ||
    line.includes('Error:') ||
    line.includes('Connection terminated') ||
    line.includes('timeout')
  )

  return likelyError ?? 'Unknown error'
}

const runCommand = async (args: string[]): Promise<{ exitCode: number; output: string }> => {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('npm', ['run', 'pipeline', '--', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stderr.write(text)
    })

    child.on('error', (error) => rejectPromise(error))
    child.on('close', (code) => {
      resolvePromise({ exitCode: code ?? 1, output })
    })
  })
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(3))
}

const runProfileWithRetries = async (
  profile: Profile,
  runNumber: number,
  totalRuns: number,
  baseArgs: string[],
  retries: number
): Promise<RunResult> => {
  const commandArgs = [...baseArgs, ...profile.extraArgs]
  const command = `npm run pipeline -- ${commandArgs.join(' ')}`

  let attempt = 0
  while (attempt <= retries) {
    attempt += 1
    const startedAt = new Date()
    const startedMs = Date.now()

    console.log('')
    console.log(`=== ${profile.id} run ${runNumber}/${totalRuns} attempt ${attempt}/${retries + 1} ===`)
    console.log(`Command: ${command}`)

    const result = await runCommand(commandArgs)
    const finishedAt = new Date()
    const durationMs = Date.now() - startedMs
    const metrics = parseMetrics(result.output)

    if (result.exitCode === 0) {
      return {
        profileId: profile.id,
        runNumber,
        attempt,
        success: true,
        command,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        exitCode: 0,
        metrics,
      }
    }

    const errorSummary = extractErrorSummary(result.output)
    const shouldRetry = attempt <= retries

    console.log(`Run failed (exit ${result.exitCode}): ${errorSummary}`)
    if (shouldRetry) {
      const delayMs = 1200 * attempt
      console.log(`Retrying in ${delayMs}ms...`)
      await sleep(delayMs)
      continue
    }

    return {
      profileId: profile.id,
      runNumber,
      attempt,
      success: false,
      command,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      exitCode: result.exitCode,
      metrics,
      errorSummary,
    }
  }

  return {
    profileId: profile.id,
    runNumber,
    attempt: retries + 1,
    success: false,
    command,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    exitCode: 1,
    metrics: {
      snapshotsSec: null,
      availabilitySec: null,
      metricsSec: null,
      totalSec: null,
      snapshotsWritten: null,
    },
    errorSummary: 'Unknown runner failure',
  }
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const baseArgs: string[] = []

  if (options.retailer) baseArgs.push(`--retailer=${options.retailer}`)
  if (options.month) baseArgs.push(`--month=${options.month}`)
  if (options.force) baseArgs.push('--force')

  console.log('========================================')
  console.log('Pipeline Benchmark Matrix')
  console.log('========================================')
  console.log(`Runs per profile: ${options.runs}`)
  console.log(`Retries per run : ${options.retries}`)
  if (options.retailer) console.log(`Retailer        : ${options.retailer}`)
  if (options.month) console.log(`Month           : ${options.month}`)
  console.log(`Force           : ${options.force ? 'yes' : 'no'}`)

  const allResults: RunResult[] = []

  for (const profile of profiles) {
    console.log('')
    console.log(`--- Profile: ${profile.id} (${profile.description}) ---`)

    for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
      const result = await runProfileWithRetries(profile, runNumber, options.runs, baseArgs, options.retries)
      allResults.push(result)
    }
  }

  const summary = profiles.map((profile) => {
    const rows = allResults.filter((row) => row.profileId === profile.id && row.success)
    const totals = rows.map((row) => row.metrics.totalSec).filter((n): n is number => n !== null)
    const snapshots = rows.map((row) => row.metrics.snapshotsSec).filter((n): n is number => n !== null)
    const availability = rows.map((row) => row.metrics.availabilitySec).filter((n): n is number => n !== null)
    const metrics = rows.map((row) => row.metrics.metricsSec).filter((n): n is number => n !== null)

    return {
      profile: profile.id,
      success_runs: rows.length,
      total_runs: options.runs,
      median_total_sec: median(totals),
      median_snapshots_sec: median(snapshots),
      median_availability_sec: median(availability),
      median_metrics_sec: median(metrics),
    }
  })

  console.log('')
  console.log('Benchmark Summary (median seconds):')
  for (const row of summary) {
    console.log(
      `  - ${row.profile}: success=${row.success_runs}/${row.total_runs}, total=${row.median_total_sec ?? 'n/a'}, snapshots=${row.median_snapshots_sec ?? 'n/a'}, availability=${row.median_availability_sec ?? 'n/a'}, metrics=${row.median_metrics_sec ?? 'n/a'}`
    )
  }

  const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, 'Z')
  mkdirSync(options.outputDir, { recursive: true })
  const outputPath = resolve(join(options.outputDir, `pipeline-benchmark-matrix-${stamp}.json`))

  const report = {
    generated_at: new Date().toISOString(),
    options,
    profiles,
    results: allResults,
    summary,
  }

  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
  console.log('')
  console.log(`Report written: ${outputPath}`)
}

run().catch((error) => {
  console.error('Benchmark runner failed:', error)
  process.exit(1)
})
