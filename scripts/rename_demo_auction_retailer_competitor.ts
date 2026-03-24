#!/usr/bin/env tsx

import { config } from 'dotenv'
import { resolve } from 'path'
import { closePool, query, transaction } from '../lib/db'
import type { PoolClient } from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })

const EXECUTE = process.argv.includes('--execute')

type DemoRetailer = {
  retailer_id: string
  retailer_name: string
}

type MonthRow = {
  month_start: string
}

type TopCompetitorRow = {
  competitor_name: string | null
}

type SnapshotRow = {
  id: number
  competitors: Array<Record<string, unknown>> | null
  top_competitor_id: string | null
  biggest_threat_id: string | null
  best_opportunity_id: string | null
}

const normalise = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase()

const renameSnapshotCompetitors = (
  competitors: Array<Record<string, unknown>> | null,
  fromName: string,
  toName: string,
): Array<Record<string, unknown>> => {
  const fromNormalised = normalise(fromName)
  const items = Array.isArray(competitors) ? competitors : []

  return items.map((competitor) => {
    const updated = { ...competitor }
    const candidateNames = [updated.id, updated.name, updated.competitor_name]
      .filter((value): value is string => typeof value === 'string')

    if (!candidateNames.some((value) => normalise(value) === fromNormalised)) {
      return updated
    }

    if (typeof updated.id === 'string') updated.id = toName
    if (typeof updated.name === 'string') updated.name = toName
    if (typeof updated.competitor_name === 'string') updated.competitor_name = toName

    return updated
  })
}

const renameSummaryName = (value: string | null, fromName: string, toName: string): string | null =>
  normalise(value) === normalise(fromName) ? toName : value

const getDemoRetailers = async (): Promise<DemoRetailer[]> => {
  const result = await query<DemoRetailer>(
    `SELECT retailer_id, retailer_name
     FROM retailers
     WHERE is_demo = true
     ORDER BY retailer_id`,
  )

  return result.rows
}

const getRetailerMonths = async (retailerId: string): Promise<string[]> => {
  const result = await query<MonthRow>(
    `SELECT DISTINCT month_start::text AS month_start
     FROM (
       SELECT month AS month_start
       FROM auction_insights
       WHERE retailer_id = $1
       UNION
       SELECT range_start AS month_start
       FROM auction_insights_snapshots
       WHERE retailer_id = $1
         AND range_type = 'month'
     ) months
     ORDER BY month_start`,
    [retailerId],
  )

  return result.rows.map((row) => row.month_start)
}

const getCurrentTopCompetitor = async (retailerId: string, month: string): Promise<string | null> => {
  const dbResult = await query<TopCompetitorRow>(
    `SELECT shop_display_name AS competitor_name
     FROM auction_insights
     WHERE retailer_id = $1
       AND month = $2::date
       AND NOT is_self
       AND preferred_for_display = true
     GROUP BY shop_display_name
     ORDER BY AVG(COALESCE(overlap_rate::numeric, 0)) DESC NULLS LAST, shop_display_name ASC
     LIMIT 1`,
    [retailerId, month],
  )

  const fromDb = dbResult.rows[0]?.competitor_name?.trim()
  if (fromDb) return fromDb

  const snapshotResult = await query<TopCompetitorRow>(
    `SELECT COALESCE(top_competitor_id, competitors->0->>'id', competitors->0->>'name', competitors->0->>'competitor_name') AS competitor_name
     FROM auction_insights_snapshots
     WHERE retailer_id = $1
       AND range_type = 'month'
       AND range_start = $2::date
     ORDER BY snapshot_date DESC, last_updated DESC
     LIMIT 1`,
    [retailerId, month],
  )

  return snapshotResult.rows[0]?.competitor_name?.trim() || null
}

const updateAuctionInsights = async (
  client: PoolClient,
  retailerId: string,
  month: string,
  currentCompetitorName: string,
  retailerName: string,
): Promise<number> => {
  const result = await client.query(
    `UPDATE auction_insights
     SET shop_display_name = $4
     WHERE retailer_id = $1
       AND month = $2::date
       AND NOT is_self
       AND preferred_for_display = true
       AND shop_display_name = $3`,
    [retailerId, month, currentCompetitorName, retailerName],
  )

  return result.rowCount ?? 0
}

const updateAuctionSnapshots = async (
  client: PoolClient,
  retailerId: string,
  month: string,
  currentCompetitorName: string,
  retailerName: string,
): Promise<number> => {
  const snapshotResult = await client.query<SnapshotRow>(
    `SELECT id, competitors, top_competitor_id, biggest_threat_id, best_opportunity_id
     FROM auction_insights_snapshots
     WHERE retailer_id = $1
       AND range_type = 'month'
       AND range_start = $2::date`,
    [retailerId, month],
  )

  for (const snapshot of snapshotResult.rows) {
    await client.query(
      `UPDATE auction_insights_snapshots
       SET competitors = $2::jsonb,
           top_competitor_id = $3,
           biggest_threat_id = $4,
           best_opportunity_id = $5,
           last_updated = NOW()
       WHERE id = $1`,
      [
        snapshot.id,
        JSON.stringify(renameSnapshotCompetitors(snapshot.competitors, currentCompetitorName, retailerName)),
        renameSummaryName(snapshot.top_competitor_id, currentCompetitorName, retailerName),
        renameSummaryName(snapshot.biggest_threat_id, currentCompetitorName, retailerName),
        renameSummaryName(snapshot.best_opportunity_id, currentCompetitorName, retailerName),
      ],
    )
  }

  return snapshotResult.rowCount ?? 0
}

async function run(): Promise<void> {
  const demoRetailers = await getDemoRetailers()

  if (demoRetailers.length === 0) {
    console.log('No demo retailers found. Nothing to do.')
    return
  }

  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`)
  console.log(`Demo retailers: ${demoRetailers.map((retailer) => retailer.retailer_id).join(', ')}`)

  const executeRename = async (client?: PoolClient) => {
    let updates = 0

    for (const retailer of demoRetailers) {
      const months = await getRetailerMonths(retailer.retailer_id)

      if (months.length === 0) {
        console.log(`[skip] retailer=${retailer.retailer_id} no auction months found`)
        continue
      }

      for (const month of months) {
        const currentCompetitorName = await getCurrentTopCompetitor(retailer.retailer_id, month)

        if (!currentCompetitorName) {
          console.log(`[skip] retailer=${retailer.retailer_id} month=${month} no top competitor found`)
          continue
        }

        if (normalise(currentCompetitorName) === normalise(retailer.retailer_name)) {
          console.log(`[skip] retailer=${retailer.retailer_id} month=${month} already renamed to ${retailer.retailer_name}`)
          continue
        }

        if (!EXECUTE || !client) {
          console.log(
            `[dry-run] retailer=${retailer.retailer_id} month=${month} rename top competitor '${currentCompetitorName}' -> '${retailer.retailer_name}'`,
          )
          updates += 1
          continue
        }

        const liveRowsUpdated = await updateAuctionInsights(
          client,
          retailer.retailer_id,
          month,
          currentCompetitorName,
          retailer.retailer_name,
        )
        const snapshotsUpdated = await updateAuctionSnapshots(
          client,
          retailer.retailer_id,
          month,
          currentCompetitorName,
          retailer.retailer_name,
        )

        console.log(
          `[updated] retailer=${retailer.retailer_id} month=${month} old='${currentCompetitorName}' new='${retailer.retailer_name}' live_rows=${liveRowsUpdated} snapshots=${snapshotsUpdated}`,
        )
        updates += 1
      }
    }

    console.log(`Completed. Month updates: ${updates}`)
  }

  if (EXECUTE) {
    await transaction(async (client) => {
      await executeRename(client)
    })
  } else {
    await executeRename()
  }
}

run()
  .catch(async (error: Error) => {
    console.error('Fatal error:', error.message)
    process.exit(1)
  })
  .finally(async () => {
    await closePool()
  })