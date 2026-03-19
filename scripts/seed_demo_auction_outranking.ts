import { config } from 'dotenv'
import { resolve } from 'path'
import { Pool, PoolClient } from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })

const MONTHS = ['2025-12-01', '2026-01-01', '2026-02-01'] as const
const RANGE_TYPE = 'month'
const EXECUTE = process.argv.includes('--execute')

const pool = new Pool({
  host: process.env.SV_DB_HOST,
  port: Number(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER,
  password: process.env.SV_DB_PASS,
  database: process.env.SV_DB_NAME,
})

type DemoRetailer = { retailer_id: string }

type CoverageRow = {
  rows: number
  avg_outranking: string | null
  zero_or_null_count: number
}

type SeedRow = {
  name: string
  value: string
}

type SnapshotRow = {
  id: number
  competitors: Array<Record<string, unknown>> | null
  top_competitor_id: string | null
  biggest_threat_id: string | null
  best_opportunity_id: string | null
}

const toSeedFromIndex = (idx: number): number => {
  // 0.20 to 0.60 deterministic spread
  const pct = 20 + ((idx * 7) % 41)
  return pct / 100
}

const toFixedSeed = (value: number): number => Number(value.toFixed(4))

const average = (values: number[]): number => {
  if (values.length === 0) return 0.35
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const getCompetitorName = (comp: Record<string, unknown>): string | null => {
  const id = typeof comp.id === 'string' && comp.id.trim() ? comp.id.trim() : null
  const name = typeof comp.name === 'string' && comp.name.trim() ? comp.name.trim() : null
  const competitorName =
    typeof comp.competitor_name === 'string' && comp.competitor_name.trim()
      ? comp.competitor_name.trim()
      : null
  return id || name || competitorName
}

const getCoverage = async (client: PoolClient, retailerId: string, month: string): Promise<CoverageRow> => {
  const result = await client.query<CoverageRow>(
    `SELECT
       COUNT(*)::int AS rows,
       AVG(COALESCE(outranking_share, 0))::text AS avg_outranking,
       COUNT(*) FILTER (WHERE outranking_share IS NULL OR outranking_share = 0)::int AS zero_or_null_count
     FROM auction_insights
     WHERE retailer_id = $1
       AND month = $2::date
       AND preferred_for_display = true
       AND is_self = false`,
    [retailerId, month],
  )

  return result.rows[0]
}

const seedAuctionInsights = async (client: PoolClient, retailerId: string, month: string): Promise<void> => {
  await client.query(
    `WITH targets AS (
       SELECT
         id,
         ROW_NUMBER() OVER (ORDER BY shop_display_name, id) AS rn
       FROM auction_insights
       WHERE retailer_id = $1
         AND month = $2::date
         AND preferred_for_display = true
         AND is_self = false
     )
     UPDATE auction_insights ai
     SET outranking_share = ((20 + ((targets.rn * 7) % 41))::numeric / 100.0)
     FROM targets
     WHERE ai.id = targets.id`,
    [retailerId, month],
  )
}

const readSeedMap = async (client: PoolClient, retailerId: string, month: string): Promise<Map<string, number>> => {
  const result = await client.query<SeedRow>(
    `SELECT
       shop_display_name AS name,
       AVG(COALESCE(outranking_share, 0))::text AS value
     FROM auction_insights
     WHERE retailer_id = $1
       AND month = $2::date
       AND preferred_for_display = true
       AND is_self = false
     GROUP BY shop_display_name`,
    [retailerId, month],
  )

  const map = new Map<string, number>()
  for (const row of result.rows) {
    map.set(row.name, Number(row.value))
  }
  return map
}

const updateSnapshots = async (
  client: PoolClient,
  retailerId: string,
  month: string,
  seedMap: Map<string, number>,
): Promise<number> => {
  const snapshotResult = await client.query<SnapshotRow>(
    `SELECT
       id,
       competitors,
       top_competitor_id,
       biggest_threat_id,
       best_opportunity_id
     FROM auction_insights_snapshots
     WHERE retailer_id = $1
       AND range_type = $2
       AND range_start = $3::date`,
    [retailerId, RANGE_TYPE, month],
  )

  if (snapshotResult.rows.length === 0) {
    return 0
  }

  const seedValues = Array.from(seedMap.values())
  const mapAverage = toFixedSeed(average(seedValues))

  for (const snapshot of snapshotResult.rows) {
    const competitors = Array.isArray(snapshot.competitors) ? snapshot.competitors : []

    const updatedCompetitors = competitors.map((comp, idx) => {
      const clone: Record<string, unknown> = { ...comp }
      const key = getCompetitorName(clone)
      const mapped = key ? seedMap.get(key) : undefined
      const fallback = toSeedFromIndex(idx + 1)
      clone.outranking_share = toFixedSeed(mapped ?? fallback)
      return clone
    })

    const competitorSeeds = updatedCompetitors
      .map((comp) => (typeof comp.outranking_share === 'number' ? comp.outranking_share : null))
      .filter((value): value is number => value !== null)

    const avgOutranking = toFixedSeed(average(competitorSeeds.length ? competitorSeeds : [mapAverage]))

    const pickSeed = (name: string | null, fallbackIdx: number): number => {
      if (name && seedMap.has(name)) {
        return toFixedSeed(seedMap.get(name) as number)
      }
      return toFixedSeed(toSeedFromIndex(fallbackIdx))
    }

    await client.query(
      `UPDATE auction_insights_snapshots
       SET
         avg_outranking_share = $2::numeric,
         top_competitor_outranking_you = $3::numeric,
         biggest_threat_outranking_you = $4::numeric,
         best_opportunity_you_outranking = $5::numeric,
         competitors = $6::jsonb
       WHERE id = $1`,
      [
        snapshot.id,
        avgOutranking,
        pickSeed(snapshot.top_competitor_id, 1),
        pickSeed(snapshot.biggest_threat_id, 2),
        pickSeed(snapshot.best_opportunity_id, 3),
        JSON.stringify(updatedCompetitors),
      ],
    )
  }

  return snapshotResult.rows.length
}

async function run(): Promise<void> {
  const client = await pool.connect()

  try {
    const demoResult = await client.query<DemoRetailer>(
      'SELECT retailer_id FROM retailers WHERE is_demo = true ORDER BY retailer_id',
    )

    if (demoResult.rowCount === 0) {
      console.log('No demo retailers found. Nothing to do.')
      return
    }

    console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`)
    console.log(`Demo retailers: ${demoResult.rows.map((row) => row.retailer_id).join(', ')}`)
    console.log(`Target months: ${MONTHS.join(', ')}`)

    if (EXECUTE) {
      await client.query('BEGIN')
    }

    let seededMonthCount = 0

    for (const retailer of demoResult.rows) {
      for (const month of MONTHS) {
        const coverage = await getCoverage(client, retailer.retailer_id, month)
        const avgOutranking = Number(coverage.avg_outranking ?? 0)
        const needsSeed = coverage.rows > 0 && (avgOutranking <= 0 || coverage.zero_or_null_count === coverage.rows)

        console.log(
          `[check] retailer=${retailer.retailer_id} month=${month} rows=${coverage.rows} avg=${avgOutranking.toFixed(4)} zero_or_null=${coverage.zero_or_null_count} needs_seed=${needsSeed}`,
        )

        if (!needsSeed) {
          continue
        }

        seededMonthCount += 1

        if (!EXECUTE) {
          console.log(`[dry-run] would seed auction outranking for retailer=${retailer.retailer_id} month=${month}`)
          continue
        }

        await seedAuctionInsights(client, retailer.retailer_id, month)
        const seedMap = await readSeedMap(client, retailer.retailer_id, month)
        const snapshotsUpdated = await updateSnapshots(client, retailer.retailer_id, month, seedMap)

        console.log(
          `[seeded] retailer=${retailer.retailer_id} month=${month} competitors=${seedMap.size} snapshots_updated=${snapshotsUpdated}`,
        )
      }
    }

    if (EXECUTE) {
      await client.query('COMMIT')
    }

    console.log(`Completed. Months seeded: ${seededMonthCount}`)
  } catch (error) {
    if (EXECUTE) {
      await client.query('ROLLBACK')
    }
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((error: Error) => {
  console.error('Fatal error:', error.message)
  process.exit(1)
})
