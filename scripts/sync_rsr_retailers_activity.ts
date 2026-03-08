import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { closePool, query, queryAnalytics } from '../lib/db'

type SyncOptions = {
  dryRun: boolean
}

type SourceRetailer = {
  source_retailer_id: string
  retailer_name: string
  network: string | null
  last_data_date: string
  is_active: boolean
}

type ExistingRetailer = {
  retailer_id: string
  source_retailer_id: string | null
  retailer_name: string
  status: string
  is_demo: boolean
  data_activity_status: string | null
  last_data_date: string | null
}

type ColumnPresence = {
  has_data_activity_status: boolean
  has_last_data_date: boolean
}

type SyncCounters = {
  inserted: number
  updated: number
  unchanged: number
  active: number
  inactive: number
}

const RETRY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1200

const parseArgs = (args: string[]): SyncOptions => {
  return {
    dryRun: args.includes('--dry-run'),
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

const withRetries = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  let lastError: unknown

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === RETRY_ATTEMPTS) break

      const delayMs = RETRY_BASE_DELAY_MS * attempt
      console.warn(`${label} failed (attempt ${attempt}/${RETRY_ATTEMPTS}): ${error instanceof Error ? error.message : String(error)}`)
      console.warn(`Retrying ${label} in ${delayMs}ms...`)
      await sleep(delayMs)
    }
  }

  throw lastError
}

const slugify = (value: string): string => {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'retailer'
}

const buildUniqueRetailerId = (
  baseName: string,
  sourceRetailerId: string,
  usedRetailerIds: Set<string>
): string => {
  const baseSlug = slugify(baseName)
  const candidates: string[] = [
    baseSlug,
    `${baseSlug}-${sourceRetailerId}`,
    `rsr-${sourceRetailerId}`,
  ]

  for (const candidate of candidates) {
    if (!usedRetailerIds.has(candidate)) {
      usedRetailerIds.add(candidate)
      return candidate
    }
  }

  let counter = 2
  while (true) {
    const candidate = `${baseSlug}-${sourceRetailerId}-${counter}`
    if (!usedRetailerIds.has(candidate)) {
      usedRetailerIds.add(candidate)
      return candidate
    }
    counter += 1
  }
}

const getSourceRetailers = async (): Promise<SourceRetailer[]> => {
  const sql = `
    WITH base AS (
      SELECT
        rm.retailer_id::text AS source_retailer_id,
        rm.retailer_name,
        rm.network,
        COALESCE(rm.report_date::date, rm.fetch_datetime::date) AS data_date,
        rm.fetch_datetime
      FROM retailer_metrics rm
      WHERE rm.retailer_id IS NOT NULL
        AND rm.retailer_name IS NOT NULL
    ), latest_name AS (
      SELECT DISTINCT ON (source_retailer_id)
        source_retailer_id,
        retailer_name,
        network
      FROM base
      ORDER BY source_retailer_id, fetch_datetime DESC
    ), activity AS (
      SELECT
        source_retailer_id,
        MAX(data_date) AS last_data_date
      FROM base
      GROUP BY source_retailer_id
    )
    SELECT
      a.source_retailer_id,
      ln.retailer_name,
      ln.network,
      a.last_data_date::text AS last_data_date,
      (a.last_data_date >= CURRENT_DATE - INTERVAL '3 months') AS is_active
    FROM activity a
    JOIN latest_name ln ON ln.source_retailer_id = a.source_retailer_id
    ORDER BY a.source_retailer_id
  `

  const result = await queryAnalytics<SourceRetailer>(sql)
  return result.rows
}

const getExistingRetailers = async (): Promise<ExistingRetailer[]> => {
  const columnsResult = await query<ColumnPresence>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'data_activity_status'
      ) AS has_data_activity_status,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'retailers'
          AND column_name = 'last_data_date'
      ) AS has_last_data_date
  `)

  const hasDataActivityStatus = columnsResult.rows[0]?.has_data_activity_status === true
  const hasLastDataDate = columnsResult.rows[0]?.has_last_data_date === true

  const result = await query<ExistingRetailer>(`
    SELECT
      retailer_id,
      source_retailer_id,
      retailer_name,
      status,
      COALESCE(is_demo, false) AS is_demo,
      ${hasDataActivityStatus ? 'data_activity_status' : 'NULL::text AS data_activity_status'},
      ${hasLastDataDate ? 'last_data_date::text' : 'NULL::text AS last_data_date'}
    FROM retailers
    ORDER BY retailer_id
  `)

  return result.rows
}

const runSync = async (options: SyncOptions): Promise<void> => {
  const columnsResult = await withRetries('check retailer activity columns', async () => {
    return await query<ColumnPresence>(`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'retailers'
            AND column_name = 'data_activity_status'
        ) AS has_data_activity_status,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'retailers'
            AND column_name = 'last_data_date'
        ) AS has_last_data_date
    `)
  })

  const hasActivityColumns =
    columnsResult.rows[0]?.has_data_activity_status === true &&
    columnsResult.rows[0]?.has_last_data_date === true

  if (!hasActivityColumns && !options.dryRun) {
    throw new Error(
      'Missing retailers data activity columns. Run migration 20260308000000_add_data_activity_fields_to_retailers_up.sql before live sync.'
    )
  }

  const sourceRetailers = await withRetries('load source retailers', getSourceRetailers)
  const existingRetailers = await withRetries('load existing retailers', getExistingRetailers)

  const bySourceId = new Map<string, ExistingRetailer>()
  const byRetailerId = new Map<string, ExistingRetailer>()
  const usedRetailerIds = new Set<string>()

  for (const row of existingRetailers) {
    usedRetailerIds.add(row.retailer_id)
    byRetailerId.set(row.retailer_id, row)
    // Keep demo rows detached from source-driven upserts so source retailers
    // (for example Boots) can be synced into their own non-demo row.
    if (row.source_retailer_id && row.is_demo !== true) {
      bySourceId.set(row.source_retailer_id, row)
    }
  }

  const counters: SyncCounters = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    active: 0,
    inactive: 0,
  }

  const apply = async (): Promise<void> => {
    for (const src of sourceRetailers) {
      if (src.is_active) counters.active += 1
      else counters.inactive += 1

      const existing = bySourceId.get(src.source_retailer_id)
        ?? byRetailerId.get(src.source_retailer_id)

      const newDataStatus = src.is_active ? 'active' : 'inactive'

      if (!existing) {
        const newRetailerId = buildUniqueRetailerId(src.retailer_name, src.source_retailer_id, usedRetailerIds)

        if (!options.dryRun) {
          if (hasActivityColumns) {
            await query(
              `
                INSERT INTO retailers (
                  retailer_id,
                  retailer_name,
                  source_retailer_id,
                  data_activity_status,
                  last_data_date,
                  status
                ) VALUES ($1, $2, $3, $4, $5::date, 'active')
              `,
              [
                newRetailerId,
                src.retailer_name,
                src.source_retailer_id,
                newDataStatus,
                src.last_data_date,
              ]
            )
          }
        }

        counters.inserted += 1
        continue
      }

      const nameChanged = existing.retailer_name !== src.retailer_name
      const sourceIdMissing = existing.source_retailer_id === null
      const statusChanged = (existing.data_activity_status ?? 'inactive') !== newDataStatus
      const lastDataChanged = existing.last_data_date !== src.last_data_date

      if (!nameChanged && !sourceIdMissing && !statusChanged && !lastDataChanged) {
        counters.unchanged += 1
        continue
      }

      if (!options.dryRun) {
        if (hasActivityColumns) {
          await query(
            `
              UPDATE retailers
              SET
                retailer_name = $2,
                source_retailer_id = COALESCE(source_retailer_id, $3),
                data_activity_status = $4,
                last_data_date = $5::date,
                updated_at = NOW()
              WHERE retailer_id = $1
            `,
            [
              existing.retailer_id,
              src.retailer_name,
              src.source_retailer_id,
              newDataStatus,
              src.last_data_date,
            ]
          )
        }
      }

      counters.updated += 1
    }
  }

  await apply()

  console.log('========================================')
  console.log('RSR Retailer Activity Sync')
  console.log('========================================')
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Activity columns present: ${hasActivityColumns ? 'yes' : 'no'}`)
  console.log(`Source retailers scanned: ${sourceRetailers.length}`)
  console.log(`Inserted: ${counters.inserted}`)
  console.log(`Updated: ${counters.updated}`)
  console.log(`Unchanged: ${counters.unchanged}`)
  console.log(`Marked active (last 3 months): ${counters.active}`)
  console.log(`Marked inactive (older than 3 months): ${counters.inactive}`)
  console.log('========================================')
}

const options = parseArgs(process.argv.slice(2))

runSync(options)
  .catch((error) => {
    console.error('Sync failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })
