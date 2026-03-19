import { config } from 'dotenv'
import { resolve } from 'path'
import { readdirSync, readFileSync } from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })

import { query, transaction, closePool } from '../lib/db'
import { parseAuctionCSV, determineDatasource, type ParsedAuctionRow } from '../lib/auction-csv-parser'
import { resolveRetailerId, SHARED_ACCOUNT_NAMES } from '../lib/auction-slug-map'
import {
  classifyAuctionCompetitorQuadrant,
  DEFAULT_AUCTION_QUADRANT_THRESHOLDS,
  type AuctionQuadrantThresholds,
} from '../lib/auction-quadrants'

type BackfillOptions = {
  folder: string
  fromMonth: string
  toMonth: string
  dryRun: boolean
  filePattern: RegExp
  batchSize: number
}

type SlugAssignment = {
  provider: string
  slug: string
  retailer_id: string | null
}

type OverrideThresholdRow = {
  retailer_id: string
  overlap_high_threshold: string | number | null
  impression_share_high_threshold: string | number | null
}

type InsertCandidate = {
  retailer_id: string | null
  month_str: string
  month_date: string
  account_name: string
  customer_id: string
  campaign_name: string
  provider: string
  slug: string
  shop_display_name: string
  is_self: boolean
  impr_share: number | null
  impr_share_is_estimate: boolean
  outranking_share: number | null
  overlap_rate: number | null
  data_source: 'dedicated' | 'shared_account' | 'transition'
  preferred_for_display: boolean
  competitor_quadrant: string
}

const parseArgs = (args: string[]): BackfillOptions => {
  const options: BackfillOptions = {
    folder: resolve(process.cwd(), 'tmp/auction-monthly-chunks'),
    fromMonth: '2025-01',
    toMonth: '2026-02',
    dryRun: false,
    filePattern: /^Auction Insights - (\d{4}-\d{2})\.csv$/,
    batchSize: 1000,
  }

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg.startsWith('--folder=')) options.folder = resolve(process.cwd(), arg.split('=')[1])
    else if (arg.startsWith('--from=')) options.fromMonth = arg.split('=')[1]
    else if (arg.startsWith('--to=')) options.toMonth = arg.split('=')[1]
    else if (arg.startsWith('--batch-size=')) {
      const parsed = Number.parseInt(arg.split('=')[1], 10)
      if (Number.isFinite(parsed) && parsed > 0) options.batchSize = parsed
    }
  }

  return options
}

const inMonthRange = (month: string, fromMonth: string, toMonth: string): boolean => {
  return month >= fromMonth && month <= toMonth
}

const toNumberOrNull = (value: string | number | null | undefined): number | null => {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const clampThreshold = (value: number | null, fallback: number): number => {
  if (value == null) return fallback
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

const buildThresholds = async (): Promise<{
  global: AuctionQuadrantThresholds
  overrides: Map<string, Partial<AuctionQuadrantThresholds>>
}> => {
  const settings = await query<{
    overlap_high_threshold: string | number | null
    impression_share_high_threshold: string | number | null
  }>(
    `SELECT overlap_high_threshold, impression_share_high_threshold
     FROM auction_classification_settings
     ORDER BY id ASC
     LIMIT 1`
  )

  const row = settings.rows[0]
  const global: AuctionQuadrantThresholds = {
    overlapHigh: clampThreshold(toNumberOrNull(row?.overlap_high_threshold), DEFAULT_AUCTION_QUADRANT_THRESHOLDS.overlapHigh),
    impressionShareHigh: clampThreshold(
      toNumberOrNull(row?.impression_share_high_threshold),
      DEFAULT_AUCTION_QUADRANT_THRESHOLDS.impressionShareHigh,
    ),
  }

  const overridesRes = await query<OverrideThresholdRow>(
    `SELECT retailer_id, overlap_high_threshold, impression_share_high_threshold
     FROM auction_classification_overrides
     WHERE is_active = true`
  )

  const overrides = new Map<string, Partial<AuctionQuadrantThresholds>>()
  for (const override of overridesRes.rows) {
    const partial: Partial<AuctionQuadrantThresholds> = {}
    const overlap = toNumberOrNull(override.overlap_high_threshold)
    const share = toNumberOrNull(override.impression_share_high_threshold)
    if (overlap != null) partial.overlapHigh = clampThreshold(overlap, global.overlapHigh)
    if (share != null) partial.impressionShareHigh = clampThreshold(share, global.impressionShareHigh)
    overrides.set(override.retailer_id, partial)
  }

  return { global, overrides }
}

const loadRetailerResolutionData = async (): Promise<{
  knownRetailers: Set<string>
  assignmentMap: Map<string, string | null>
}> => {
  const retailerRes = await query<{ retailer_id: string }>('SELECT retailer_id FROM retailers')
  const assignmentRes = await query<SlugAssignment>('SELECT provider, slug, retailer_id FROM auction_slug_assignments')

  const knownRetailers = new Set(retailerRes.rows.map((r) => r.retailer_id))
  const assignmentMap = new Map<string, string | null>()
  for (const row of assignmentRes.rows) {
    assignmentMap.set(`${row.provider}:${row.slug}`, row.retailer_id)
  }

  return { knownRetailers, assignmentMap }
}

const resolveRetailer = (
  provider: string,
  slug: string,
  knownRetailers: Set<string>,
  assignmentMap: Map<string, string | null>
): string | null => {
  const key = `${provider}:${slug}`
  if (assignmentMap.has(key)) return assignmentMap.get(key) ?? null
  return resolveRetailerId(provider, slug, knownRetailers)
}

const buildCandidatesForFile = (
  rows: ParsedAuctionRow[],
  knownRetailers: Set<string>,
  assignmentMap: Map<string, string | null>,
  thresholds: AuctionQuadrantThresholds,
  overridesByRetailer: Map<string, Partial<AuctionQuadrantThresholds>>
): { candidates: InsertCandidate[]; skippedUnparsable: number } => {
  const slugMonthAccounts = new Map<string, Set<string>>()

  for (const row of rows) {
    if (!row.provider || !row.slug) continue
    const slotKey = `${row.provider}:${row.slug}:${row.month_str}`
    const existing = slugMonthAccounts.get(slotKey) ?? new Set<string>()
    existing.add(row.customer_id)
    slugMonthAccounts.set(slotKey, existing)
  }

  const preferredCustomerForSlot = new Map<string, string>()

  for (const [slotKey, customerIds] of slugMonthAccounts.entries()) {
    if (customerIds.size <= 1) {
      preferredCustomerForSlot.set(slotKey, Array.from(customerIds)[0])
      continue
    }

    const [provider, slug, monthStr] = slotKey.split(':')
    const customerToAccount = new Map<string, string>()
    for (const row of rows) {
      if (row.provider === provider && row.slug === slug && row.month_str === monthStr) {
        customerToAccount.set(row.customer_id, row.account_name)
      }
    }

    const dedicated = Array.from(customerIds).filter((id) => {
      const accountName = customerToAccount.get(id) ?? ''
      return !SHARED_ACCOUNT_NAMES.has(accountName.toLowerCase())
    })

    const candidates = dedicated.length > 0 ? dedicated : Array.from(customerIds)
    candidates.sort()
    preferredCustomerForSlot.set(slotKey, candidates[0])
  }

  const dedup = new Map<string, InsertCandidate>()
  let skippedUnparsable = 0

  for (const row of rows) {
    if (!row.provider || !row.slug) {
      skippedUnparsable++
      continue
    }

    const retailerId = resolveRetailer(row.provider, row.slug, knownRetailers, assignmentMap)
    const slotKey = `${row.provider}:${row.slug}:${row.month_str}`
    const isTransition = (slugMonthAccounts.get(slotKey)?.size ?? 0) > 1
    const dataSource = determineDatasource(row.account_name, isTransition)
    const preferredCustomerId = preferredCustomerForSlot.get(slotKey)
    const preferredForDisplay = row.customer_id === preferredCustomerId

    const retailerThresholds = retailerId ? overridesByRetailer.get(retailerId) : undefined
    const quadrantThresholds: AuctionQuadrantThresholds = {
      overlapHigh: retailerThresholds?.overlapHigh ?? thresholds.overlapHigh,
      impressionShareHigh: retailerThresholds?.impressionShareHigh ?? thresholds.impressionShareHigh,
    }

    const competitorQuadrant = classifyAuctionCompetitorQuadrant(
      row.overlap_rate,
      row.impr_share,
      row.is_self,
      quadrantThresholds,
    )

    const candidate: InsertCandidate = {
      retailer_id: retailerId,
      month_str: row.month_str,
      month_date: `${row.month_str}-01`,
      account_name: row.account_name,
      customer_id: row.customer_id,
      campaign_name: row.campaign_name,
      provider: row.provider,
      slug: row.slug,
      shop_display_name: row.shop_display_name,
      is_self: row.is_self,
      impr_share: row.impr_share,
      impr_share_is_estimate: row.impr_share_is_estimate,
      outranking_share: row.outranking_share,
      overlap_rate: row.overlap_rate,
      data_source: dataSource,
      preferred_for_display: preferredForDisplay,
      competitor_quadrant: competitorQuadrant,
    }

    const dedupKey = `${candidate.retailer_id ?? 'null'}:${candidate.month_str}:${candidate.campaign_name}:${candidate.shop_display_name}`
    const existing = dedup.get(dedupKey)
    if (!existing || (!existing.preferred_for_display && candidate.preferred_for_display)) {
      dedup.set(dedupKey, candidate)
    }
  }

  const preferredByRetailerMonth = new Map<string, Map<string, string>>()
  for (const candidate of dedup.values()) {
    if (!candidate.preferred_for_display || !candidate.retailer_id) continue
    const rmKey = `${candidate.retailer_id}:${candidate.month_str}`
    const slugKey = `${candidate.provider}:${candidate.slug}`
    const existing = preferredByRetailerMonth.get(rmKey) ?? new Map<string, string>()
    if (!existing.has(slugKey)) existing.set(slugKey, candidate.data_source)
    preferredByRetailerMonth.set(rmKey, existing)
  }

  const winnerByRetailerMonth = new Map<string, string>()
  for (const [rmKey, slugMap] of preferredByRetailerMonth.entries()) {
    const choices = Array.from(slugMap.entries())
    choices.sort(([keyA, srcA], [keyB, srcB]) => {
      const scoreA = srcA === 'dedicated' ? -1 : 0
      const scoreB = srcB === 'dedicated' ? -1 : 0
      if (scoreA !== scoreB) return scoreA - scoreB
      return keyA.localeCompare(keyB)
    })
    winnerByRetailerMonth.set(rmKey, choices[0][0])
  }

  const candidates: InsertCandidate[] = []
  for (const candidate of dedup.values()) {
    if (candidate.preferred_for_display && candidate.retailer_id) {
      const winner = winnerByRetailerMonth.get(`${candidate.retailer_id}:${candidate.month_str}`)
      if (winner && winner !== `${candidate.provider}:${candidate.slug}`) {
        candidate.preferred_for_display = false
      }
    }
    candidates.push(candidate)
  }

  return { candidates, skippedUnparsable }
}

const insertCandidates = async (candidates: InsertCandidate[], batchSize: number): Promise<number> => {
  if (candidates.length === 0) return 0

  let inserted = 0

  await transaction(async (client) => {
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize)
      const params: unknown[] = []
      const valuesSql = batch.map((row, idx) => {
        const base = idx * 17
        params.push(
          row.retailer_id,
          row.month_date,
          row.account_name,
          row.customer_id,
          row.campaign_name,
          row.provider,
          row.slug,
          row.shop_display_name,
          row.is_self,
          row.impr_share,
          row.impr_share_is_estimate,
          row.outranking_share,
          row.overlap_rate,
          row.data_source,
          row.preferred_for_display,
          row.competitor_quadrant,
          null,
        )

        return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17})`
      })

      const result = await client.query(
        `INSERT INTO auction_insights (
           retailer_id,
           month,
           account_name,
           customer_id,
           campaign_name,
           provider,
           slug,
           shop_display_name,
           is_self,
           impr_share,
           impr_share_is_estimate,
           outranking_share,
           overlap_rate,
           data_source,
           preferred_for_display,
           competitor_quadrant,
           upload_id
         ) VALUES ${valuesSql.join(',')}
         ON CONFLICT DO NOTHING`,
        params,
      )

      inserted += result.rowCount ?? 0
    }
  })

  return inserted
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))

  const files = readdirSync(options.folder)
    .map((name) => {
      const match = name.match(options.filePattern)
      return {
        name,
        month: match?.[1] ?? null,
      }
    })
    .filter((f): f is { name: string; month: string } => f.month !== null)
    .filter((f) => inMonthRange(f.month, options.fromMonth, options.toMonth))
    .sort((a, b) => a.month.localeCompare(b.month))

  if (files.length === 0) {
    console.log(`No monthly auction CSV files found in range ${options.fromMonth}..${options.toMonth}`)
    return
  }

  const { knownRetailers, assignmentMap } = await loadRetailerResolutionData()
  const { global: globalThresholds, overrides: overridesByRetailer } = await buildThresholds()

  let totalParsed = 0
  let totalCandidates = 0
  let totalInserted = 0
  let totalSkipped = 0
  let totalUnparsable = 0

  console.log('Auction backfill starting')
  console.log(`Folder      : ${options.folder}`)
  console.log(`Month range : ${options.fromMonth}..${options.toMonth}`)
  console.log(`Dry run     : ${options.dryRun ? 'yes' : 'no'}`)
  console.log('')

  for (const file of files) {
    const fullPath = resolve(options.folder, file.name)
    const buffer = readFileSync(fullPath)
    const parsed = parseAuctionCSV(buffer)

    const { candidates, skippedUnparsable } = buildCandidatesForFile(
      parsed.rows,
      knownRetailers,
      assignmentMap,
      globalThresholds,
      overridesByRetailer,
    )

    const inserted = options.dryRun ? 0 : await insertCandidates(candidates, options.batchSize)
    const skipped = options.dryRun ? 0 : candidates.length - inserted

    totalParsed += parsed.rows.length
    totalCandidates += candidates.length
    totalInserted += inserted
    totalSkipped += skipped
    totalUnparsable += skippedUnparsable

    const unresolvedCount = candidates.filter((c) => c.retailer_id === null).length

    console.log(
      `${file.month}  parsed=${parsed.rows.length}  candidates=${candidates.length}  inserted=${inserted}${
        options.dryRun ? ' [dry-run]' : ''
      }  unresolved=${unresolvedCount}  unparsable_campaign=${skippedUnparsable}`,
    )
  }

  console.log('')
  console.log('Backfill complete')
  console.log(`Files processed       : ${files.length}`)
  console.log(`Rows parsed           : ${totalParsed}`)
  console.log(`Rows eligible         : ${totalCandidates}`)
  console.log(`Rows inserted         : ${totalInserted}`)
  console.log(`Rows skipped(existing): ${totalSkipped}`)
  console.log(`Rows skipped(unparse) : ${totalUnparsable}`)
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })
