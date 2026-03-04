import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { Pool, PoolClient } from 'pg'

const pool = new Pool({
  host: process.env.SV_DB_HOST,
  port: parseInt(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER,
  password: process.env.SV_DB_PASS,
  database: process.env.SV_DB_NAME,
})

const RETAILER_ID = 'demo'
const FREEZE_DATE = '2026-03-01'
const isExecute = process.argv.includes('--execute')

type Operation = {
  table: string
  countSql: string
  countParams: any[]
  action: string
  dmlSql: string
  dmlParams: any[]
}

const operations: Operation[] = [
  {
    table: 'retailers',
    countSql: 'SELECT COUNT(*)::int AS count FROM retailers WHERE retailer_id = $1',
    countParams: [RETAILER_ID],
    action: 'updated',
    dmlSql:
      'UPDATE retailers SET is_demo = true, snapshot_enabled = false WHERE retailer_id = $1',
    dmlParams: [RETAILER_ID],
  },
  {
    table: 'retailer_access_tokens',
    countSql:
      'SELECT COUNT(*)::int AS count FROM retailer_access_tokens WHERE retailer_id = $1 AND is_active = true',
    countParams: [RETAILER_ID],
    action: 'updated',
    dmlSql:
      'UPDATE retailer_access_tokens SET is_active = false WHERE retailer_id = $1 AND is_active = true',
    dmlParams: [RETAILER_ID],
  },
  {
    table: 'keywords_snapshots',
    countSql:
      'SELECT COUNT(*)::int AS count FROM keywords_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    countParams: [RETAILER_ID, FREEZE_DATE],
    action: 'deleted',
    dmlSql: 'DELETE FROM keywords_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    dmlParams: [RETAILER_ID, FREEZE_DATE],
  },
  {
    table: 'category_performance_snapshots',
    countSql:
      'SELECT COUNT(*)::int AS count FROM category_performance_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    countParams: [RETAILER_ID, FREEZE_DATE],
    action: 'deleted',
    dmlSql:
      'DELETE FROM category_performance_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    dmlParams: [RETAILER_ID, FREEZE_DATE],
  },
  {
    table: 'category_snapshot_periods',
    countSql:
      'SELECT COUNT(*)::int AS count FROM category_snapshot_periods WHERE retailer_id = $1 AND range_start >= $2',
    countParams: [RETAILER_ID, FREEZE_DATE],
    action: 'deleted',
    dmlSql: 'DELETE FROM category_snapshot_periods WHERE retailer_id = $1 AND range_start >= $2',
    dmlParams: [RETAILER_ID, FREEZE_DATE],
  },
  {
    table: 'product_performance_snapshots',
    countSql:
      'SELECT COUNT(*)::int AS count FROM product_performance_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    countParams: [RETAILER_ID, FREEZE_DATE],
    action: 'deleted',
    dmlSql:
      'DELETE FROM product_performance_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    dmlParams: [RETAILER_ID, FREEZE_DATE],
  },
  {
    table: 'auction_insights_snapshots',
    countSql:
      'SELECT COUNT(*)::int AS count FROM auction_insights_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    countParams: [RETAILER_ID, FREEZE_DATE],
    action: 'deleted',
    dmlSql: 'DELETE FROM auction_insights_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    dmlParams: [RETAILER_ID, FREEZE_DATE],
  },
  {
    table: 'product_coverage_snapshots',
    countSql:
      'SELECT COUNT(*)::int AS count FROM product_coverage_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    countParams: [RETAILER_ID, FREEZE_DATE],
    action: 'deleted',
    dmlSql: 'DELETE FROM product_coverage_snapshots WHERE retailer_id = $1 AND range_start >= $2',
    dmlParams: [RETAILER_ID, FREEZE_DATE],
  },
  {
    table: 'retailer_snapshot_health',
    countSql: 'SELECT COUNT(*)::int AS count FROM retailer_snapshot_health WHERE retailer_id = $1',
    countParams: [RETAILER_ID],
    action: 'deleted',
    dmlSql: 'DELETE FROM retailer_snapshot_health WHERE retailer_id = $1',
    dmlParams: [RETAILER_ID],
  },
]

async function runDryRun() {
  for (const op of operations) {
    const countRes = await pool.query<{ count: number }>(op.countSql, op.countParams)
    const count = countRes.rows[0]?.count ?? 0
    console.log(`[TABLE] ${op.table}: ${count} rows will be ${op.action}`)
  }

  console.log('DRY RUN complete — no changes made. Re-run with --execute to apply.')
}

async function runExecute() {
  const client: PoolClient = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const op of operations) {
      const countRes = await client.query<{ count: number }>(op.countSql, op.countParams)
      const count = countRes.rows[0]?.count ?? 0
      await client.query(op.dmlSql, op.dmlParams)
      console.log(`[TABLE] ${op.table}: ${op.action} ${count} rows`)
    }

    await client.query('COMMIT')
    console.log('✅ All changes committed. Demo retailer is now frozen.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  try {
    if (isExecute) {
      await runExecute()
    } else {
      await runDryRun()
    }
  } finally {
    await pool.end()
  }
}

main().catch((e: Error) => {
  console.error('Fatal error:', e.message)
  process.exit(1)
})
