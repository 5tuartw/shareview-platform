/**
 * Migrate retailer metadata from RSR DB into ShareView retailer_metadata.
 *
 * - Inserts the 30 priority retailers (snapshot_enabled = false until source data arrives)
 * - Also inserts retailers that already have source data with snapshot_enabled = true
 * - Uses ON CONFLICT DO NOTHING so it is safe to re-run
 *
 * Run: npx tsx scripts/migrate-retailer-metadata.ts
 * Dry run: npx tsx scripts/migrate-retailer-metadata.ts --dry-run
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { Pool } from 'pg'

const sv = new Pool({
  host: process.env.SV_DB_HOST,
  port: parseInt(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER,
  password: process.env.SV_DB_PASS,
  database: process.env.SV_DB_NAME,
})

const isDryRun = process.argv.includes('--dry-run')

// ---------------------------------------------------------------------------
// Retailer definitions
//
// retailer_id   = slug used in ShareView DB (must match source DB retailer_id
//                 when data arrives from the other team)
// rsr_id        = numeric/string ID from RSR retailer_metrics
// retailer_name = display name
// sector        = rough sector classification
// snapshotNow   = true for retailers that already have source data
// ---------------------------------------------------------------------------
const RETAILERS: Array<{
  retailer_id: string
  rsr_id: string | null
  retailer_name: string
  sector: string | null
  snapshotNow: boolean
}> = [
  // ---- Already have source data (enable snapshots immediately) ------------
  { retailer_id: 'flannels',     rsr_id: '1011l6018', retailer_name: 'Flannels',          sector: 'fashion',        snapshotNow: true  },
  { retailer_id: 'frasers',      rsr_id: '1100l5964', retailer_name: 'Frasers',            sector: 'fashion',        snapshotNow: true  },
  { retailer_id: 'feelunique',   rsr_id: null,         retailer_name: 'Feel Unique',        sector: 'health_beauty',  snapshotNow: true  },
  { retailer_id: 'lookfantastic', rsr_id: '2082',      retailer_name: 'LookFantastic',      sector: 'health_beauty',  snapshotNow: true  },

  // ---- Priority 30 retailers (snapshot_enabled = false until data arrives) -
  { retailer_id: 'qvc',             rsr_id: '7202610',   retailer_name: 'QVC',                   sector: 'general',        snapshotNow: false },
  { retailer_id: 'cos',             rsr_id: '47832',     retailer_name: 'COS',                   sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'cos-de',          rsr_id: '46463',     retailer_name: 'COS DE',                sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'schuh',           rsr_id: '2044',      retailer_name: 'Schuh',                 sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'uniqlo',          rsr_id: '6771',      retailer_name: 'Uniqlo',                sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'lounge-underwear',rsr_id: '38798',     retailer_name: 'Lounge Underwear',      sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'marks-and-spencer',rsr_id: '1402',     retailer_name: 'Marks & Spencer',       sector: 'general',        snapshotNow: false },
  { retailer_id: 'aspinal-of-london',rsr_id: '50405',    retailer_name: 'Aspinal of London',     sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'nobodys-child',   rsr_id: '7090990',   retailer_name: "Nobody's Child",        sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'harts-of-stur',   rsr_id: '32187',     retailer_name: 'Harts Of Stur',         sector: 'home_garden',    snapshotNow: false },
  { retailer_id: 'arket',           rsr_id: '1011l6451', retailer_name: 'ARKET UK',              sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'jd-williams',     rsr_id: '3032',      retailer_name: 'JD Williams',           sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'jacamo',          rsr_id: '3026',      retailer_name: 'Jacamo',                sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'simply-be',       rsr_id: '3027',      retailer_name: 'Simply Be',             sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'asda-george',     rsr_id: '6400033',   retailer_name: 'Asda George',           sector: 'general',        snapshotNow: false },
  { retailer_id: 'lego',            rsr_id: '24340',     retailer_name: 'LEGO',                  sector: 'toys_games',     snapshotNow: false },
  { retailer_id: 'etsy',            rsr_id: '6091',      retailer_name: 'Etsy',                  sector: 'marketplace',    snapshotNow: false },
  { retailer_id: 'pets-at-home',    rsr_id: '40864',     retailer_name: 'Pets at Home',          sector: 'pets',           snapshotNow: false },
  { retailer_id: 'brora',           rsr_id: '17043',     retailer_name: 'Brora',                 sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'brandalley',      rsr_id: '5221712',   retailer_name: 'BrandAlley',            sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'tk-maxx',         rsr_id: '43244',     retailer_name: 'TK Maxx UK',            sector: 'general',        snapshotNow: false },
  { retailer_id: 'boohooman',       rsr_id: '7009',      retailer_name: 'BoohooMan',             sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'harvey-nichols',  rsr_id: '1101l6310', retailer_name: 'Harvey Nichols',        sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'fenwick',         rsr_id: '1101l6495', retailer_name: 'Fenwick',               sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'allsaints',       rsr_id: '45532',     retailer_name: 'AllSaints',             sector: 'fashion',        snapshotNow: false },
  { retailer_id: 'currys',          rsr_id: '1599',      retailer_name: 'Currys',                sector: 'electronics',    snapshotNow: false },
  { retailer_id: 'sephora',         rsr_id: '1011l6629', retailer_name: 'Sephora',               sector: 'health_beauty',  snapshotNow: false },
  { retailer_id: 'levis',           rsr_id: '53153',     retailer_name: "Levi's",                sector: 'fashion',        snapshotNow: false },
]

async function main() {
  console.log(`\n========================================`)
  console.log(`Retailer Metadata Migration`)
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Retailers to process: ${RETAILERS.length}`)
  console.log(`========================================\n`)

  // Check what's already in ShareView
  const existing = await sv.query<{ retailer_id: string }>(
    'SELECT retailer_id FROM retailer_metadata'
  )
  const existingIds = new Set(existing.rows.map(r => r.retailer_id))
  console.log(`Already in retailer_metadata: ${[...existingIds].join(', ')}\n`)

  let inserted = 0
  let skipped = 0
  let updated = 0

  for (const r of RETAILERS) {
    if (existingIds.has(r.retailer_id)) {
      // Already exists — update snapshot_enabled if snapshotNow is true and it's not already enabled
      if (r.snapshotNow) {
        console.log(`  [UPDATE] ${r.retailer_id} — already exists, enabling snapshot`)
        if (!isDryRun) {
          await sv.query(
            `UPDATE retailer_metadata
             SET snapshot_enabled = true,
                 snapshot_default_ranges = COALESCE(snapshot_default_ranges, '{month}'),
                 snapshot_detail_level = COALESCE(snapshot_detail_level, 'summary'),
                 snapshot_retention_days = COALESCE(snapshot_retention_days, 90),
                 updated_at = NOW()
             WHERE retailer_id = $1 AND snapshot_enabled = false`,
            [r.retailer_id]
          )
        }
        updated++
      } else {
        console.log(`  [SKIP]   ${r.retailer_id} — already exists`)
        skipped++
      }
      continue
    }

    const snapshotEnabled = r.snapshotNow
    console.log(
      `  [INSERT] ${r.retailer_id.padEnd(26)} "${r.retailer_name}"` +
      (snapshotEnabled ? ' [snapshot ON]' : ' [snapshot OFF]') +
      (r.rsr_id ? ` (RSR: ${r.rsr_id})` : '')
    )

    if (!isDryRun) {
      await sv.query(
        `INSERT INTO retailer_metadata (
           retailer_id, retailer_name, sector, status,
           snapshot_enabled, snapshot_default_ranges, snapshot_detail_level, snapshot_retention_days,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'active',
           $4, '{month}', 'summary', 90,
           NOW(), NOW()
         )
         ON CONFLICT (retailer_id) DO NOTHING`,
        [r.retailer_id, r.retailer_name, r.sector, snapshotEnabled]
      )
    }
    inserted++
  }

  console.log(`\n----------------------------------------`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Updated:  ${updated}`)
  console.log(`Skipped:  ${skipped}`)
  if (isDryRun) console.log(`\n(Dry run — no changes made)`)
  console.log(`========================================\n`)

  await sv.end()
}

main().catch(e => {
  console.error('Fatal error:', e.message)
  process.exit(1)
})
