import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { Pool } from 'pg'

const pool = new Pool({
  host: process.env.SV_DB_HOST,
  port: parseInt(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER,
  password: process.env.SV_DB_PASS,
  database: process.env.SV_DB_NAME,
})

const RETAILER_ID = 'demo'
const FREEZE_DATE = '2026-03-01'

async function main() {
  const results: boolean[] = []

  const check = (label: string, passed: boolean, detail?: string) => {
    results.push(passed)
    if (passed) {
      console.log(`✅ PASS ${label}`)
      return
    }
    console.log(`❌ FAIL ${label}${detail ? ` [${detail}]` : ''}`)
  }

  const isDemoRes = await pool.query<{ is_demo: boolean | null }>(
    'SELECT is_demo FROM retailers WHERE retailer_id = $1',
    [RETAILER_ID],
  )
  const isDemoValue = isDemoRes.rows[0]?.is_demo
  check('retailers.is_demo is true', isDemoValue === true, `actual=${String(isDemoValue)}`)

  const snapshotEnabledRes = await pool.query<{ snapshot_enabled: boolean | null }>(
    'SELECT snapshot_enabled FROM retailers WHERE retailer_id = $1',
    [RETAILER_ID],
  )
  const snapshotEnabledValue = snapshotEnabledRes.rows[0]?.snapshot_enabled
  check(
    'retailers.snapshot_enabled is false',
    snapshotEnabledValue === false,
    `actual=${String(snapshotEnabledValue)}`,
  )

  const activeTokensRes = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM retailer_access_tokens WHERE retailer_id = $1 AND is_active = true',
    [RETAILER_ID],
  )
  const activeTokens = activeTokensRes.rows[0]?.count ?? 0
  check('no active retailer_access_tokens', activeTokens === 0, `actual=${activeTokens}`)

  const futureSnapshotsRes = await pool.query<{ total: number }>(
    `
      SELECT (
        (SELECT COUNT(*)::int FROM keywords_snapshots WHERE retailer_id = $1 AND range_start >= $2) +
        (SELECT COUNT(*)::int FROM category_performance_snapshots WHERE retailer_id = $1 AND range_start >= $2) +
        (SELECT COUNT(*)::int FROM category_snapshot_periods WHERE retailer_id = $1 AND range_start >= $2) +
        (SELECT COUNT(*)::int FROM product_performance_snapshots WHERE retailer_id = $1 AND range_start >= $2) +
        (SELECT COUNT(*)::int FROM auction_insights_snapshots WHERE retailer_id = $1 AND range_start >= $2) +
        (SELECT COUNT(*)::int FROM product_coverage_snapshots WHERE retailer_id = $1 AND range_start >= $2)
      )::int AS total
    `,
    [RETAILER_ID, FREEZE_DATE],
  )
  const futureSnapshotsTotal = futureSnapshotsRes.rows[0]?.total ?? 0
  check(
    'no post-freeze snapshot rows remain',
    futureSnapshotsTotal === 0,
    `actual=${futureSnapshotsTotal}`,
  )

  const healthRes = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM retailer_snapshot_health WHERE retailer_id = $1',
    [RETAILER_ID],
  )
  const healthCount = healthRes.rows[0]?.count ?? 0
  check('no retailer_snapshot_health rows remain', healthCount === 0, `actual=${healthCount}`)

  const passedCount = results.filter(Boolean).length
  console.log(`${passedCount}/5 checks passed`)

  await pool.end()

  if (passedCount !== 5) {
    process.exit(1)
  }
}

main().catch((e: Error) => {
  console.error('Fatal error:', e.message)
  process.exit(1)
})
