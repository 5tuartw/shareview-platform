import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { Pool, PoolClient } from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })

const EXECUTE = process.argv.includes('--execute')
const SOURCE = 'cur8or-es'
const CSV_PATH = resolve(process.cwd(), 'docs/cur8or-live-retailer-brands-variants.csv')

type CsvRow = {
  store: string
  brand: string
  docCount: number
}

type RetailerRow = {
  retailer_id: string
  retailer_name: string
}

const pool = new Pool({
  host: process.env.SV_DB_HOST,
  port: Number(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER,
  password: process.env.SV_DB_PASS,
  database: process.env.SV_DB_NAME,
})

const normalizeKey = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const slugify = (value: string): string => normalizeKey(value).replace(/ /g, '-')

const parseCsvLine = (line: string): string[] => {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let idx = 0; idx < line.length; idx += 1) {
    const char = line[idx]

    if (char === '"') {
      if (inQuotes && line[idx + 1] === '"') {
        current += '"'
        idx += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += char
  }

  fields.push(current)
  return fields
}

const loadCsvRows = (): CsvRow[] => {
  const raw = readFileSync(CSV_PATH, 'utf8')
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (lines.length <= 1) {
    return []
  }

  return lines.slice(1).reduce<CsvRow[]>((acc, line, index) => {
    const [store, brand, docCountRaw] = parseCsvLine(line)
    const docCount = Number(docCountRaw)

    if (!store || !brand || Number.isNaN(docCount)) {
      return acc
    }

    acc.push({
      store: store.trim(),
      brand: brand.trim(),
      docCount,
    })

    return acc
  }, [])
}

const buildRetailerLookup = (rows: RetailerRow[]): Map<string, RetailerRow> => {
  const lookup = new Map<string, RetailerRow>()

  for (const row of rows) {
    lookup.set(normalizeKey(row.retailer_id), row)
    lookup.set(normalizeKey(row.retailer_name), row)
  }

  return lookup
}

const resolveRetailer = (store: string, lookup: Map<string, RetailerRow>): RetailerRow | null => {
  const direct = lookup.get(normalizeKey(store))
  if (direct) {
    return direct
  }

  const manualAliases = new Map<string, string>([
    ['brand alley', 'brandalley'],
    ['marks and spencer', 'marks-and-spencer'],
    ['nobodys child', 'nobodys-child'],
    ['asda george', 'asda-george'],
    ['harts of stur', 'harts-of-stur'],
    ['pets at home', 'pets-at-home'],
    ['aspinal of london', 'aspinal-of-london'],
    ['jd williams', 'jd-williams'],
    ['simply be', 'simply-be'],
    ['tk maxx', 'tk-maxx'],
    ['boohoo man', 'boohooman'],
    ['benefit cosmetics', 'benefit-cosmetics-uk'],
    ['espa skincare', 'espa-skincare-uk'],
    ['etsy category', 'etsy'],
    ['lookfantastic com', 'lookfantastic'],
    ['lounge', 'lounge-underwear'],
    ['new era', 'new-era-cap'],
    ['oasis', 'oasis-uk-ie'],
    ['free people', 'free-people-uk'],
    ['cambridge satchel', 'the-cambridge-satchel-company'],
    ['templespa', 'temple-spa'],
    ['fitflop', 'fitflop-ltd'],
  ])

  const aliasedRetailerId = manualAliases.get(normalizeKey(store))
  if (!aliasedRetailerId) {
    return null
  }

  return lookup.get(normalizeKey(aliasedRetailerId)) ?? null
}

const fetchRetailers = async (client: PoolClient): Promise<RetailerRow[]> => {
  const result = await client.query<RetailerRow>(
    'SELECT retailer_id, retailer_name FROM retailers ORDER BY retailer_id'
  )
  return result.rows
}

const upsertBrand = async (client: PoolClient, brand: string): Promise<number> => {
  const normalized = normalizeKey(brand)
  const slug = slugify(brand)
  const result = await client.query<{ brand_id: number }>(
    `INSERT INTO brands (canonical_name, canonical_name_normalized, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (canonical_name_normalized)
     DO UPDATE SET
       canonical_name = EXCLUDED.canonical_name,
       slug = EXCLUDED.slug,
       updated_at = NOW()
     RETURNING brand_id`,
    [brand, normalized, slug],
  )
  return result.rows[0].brand_id
}

const upsertBrandAlias = async (client: PoolClient, brandId: number, brand: string): Promise<number> => {
  const normalized = normalizeKey(brand)
  const result = await client.query<{ brand_alias_id: number }>(
    `INSERT INTO brand_aliases (brand_id, alias_name, alias_name_normalized, source, confidence)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source, alias_name_normalized)
     DO UPDATE SET
       brand_id = EXCLUDED.brand_id,
       alias_name = EXCLUDED.alias_name,
       confidence = EXCLUDED.confidence,
       updated_at = NOW()
     RETURNING brand_alias_id`,
    [brandId, brand, normalized, SOURCE, 1],
  )
  return result.rows[0].brand_alias_id
}

const upsertPresence = async (
  client: PoolClient,
  retailerId: string,
  brandId: number,
  brandAliasId: number,
  store: string,
  docCount: number,
): Promise<void> => {
  const metadata = JSON.stringify({
    store_name: store,
    import_file: 'docs/cur8or-live-retailer-brands-variants.csv',
  })

  await client.query(
    `INSERT INTO retailer_brand_presence (
       retailer_id,
       brand_id,
       source,
       source_brand_alias_id,
       first_seen_at,
       last_seen_at,
       latest_doc_count,
       is_current,
       metadata,
       created_at,
       updated_at
     )
     VALUES (
       $1, $2, $3, $4, NOW(), NOW(), $5, true,
       $6::jsonb,
       NOW(), NOW()
     )
     ON CONFLICT (retailer_id, brand_id, source)
     DO UPDATE SET
       source_brand_alias_id = EXCLUDED.source_brand_alias_id,
       last_seen_at = NOW(),
       latest_doc_count = EXCLUDED.latest_doc_count,
       is_current = true,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [retailerId, brandId, SOURCE, brandAliasId, docCount, metadata],
  )
}

async function run(): Promise<void> {
  const client = await pool.connect()

  try {
    const csvRows = loadCsvRows()
    if (csvRows.length === 0) {
      console.log('No CSV rows found. Nothing to import.')
      return
    }

    const retailers = await fetchRetailers(client)
    const retailerLookup = buildRetailerLookup(retailers)
    const unmatchedStores = [...new Set(csvRows.map((row) => row.store))]
      .filter((store) => resolveRetailer(store, retailerLookup) === null)

    console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`)
    console.log(`CSV rows: ${csvRows.length}`)
    console.log(`Retailers loaded: ${retailers.length}`)

    if (unmatchedStores.length > 0) {
      console.log(`Unmatched stores (${unmatchedStores.length}): ${unmatchedStores.join(', ')}`)
    } else {
      console.log('All stores matched to ShareView retailers.')
    }

    if (!EXECUTE) {
      const preview = csvRows.slice(0, 10).map((row) => {
        const retailer = resolveRetailer(row.store, retailerLookup)
        return `${row.store} -> ${retailer?.retailer_id ?? 'UNMATCHED'} :: ${row.brand} (${row.docCount})`
      })
      console.log(preview.join('\n'))
      return
    }

    await client.query('BEGIN')
    await client.query(
      `UPDATE retailer_brand_presence
       SET is_current = false, updated_at = NOW()
       WHERE source = $1`,
      [SOURCE],
    )

    let processed = 0
    let skipped = 0

    for (const row of csvRows) {
      const retailer = resolveRetailer(row.store, retailerLookup)
      if (!retailer) {
        skipped += 1
        console.warn(`[skip] unmatched store=${row.store} brand=${row.brand}`)
        continue
      }

      const brandId = await upsertBrand(client, row.brand)
      const brandAliasId = await upsertBrandAlias(client, brandId, row.brand)
      await upsertPresence(client, retailer.retailer_id, brandId, brandAliasId, row.store, row.docCount)
      processed += 1
    }

    await client.query('COMMIT')
    console.log(`Import complete. Processed=${processed} Skipped=${skipped}`)
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