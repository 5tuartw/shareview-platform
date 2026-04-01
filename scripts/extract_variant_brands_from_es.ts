/**
 * Extract brands from Elasticsearch products index using variant-level brand field.
 *
 * The products index uses grouped documents where brand data lives in the
 * nested `variants[]` array, NOT at the root level. This script uses nested
 * aggregations to correctly enumerate all brands per store.
 *
 * Usage:
 *   npx tsx scripts/extract_variant_brands_from_es.ts
 *   npx tsx scripts/extract_variant_brands_from_es.ts --compare
 *
 * Flags:
 *   --compare  Also load the existing CSV and show differences
 *
 * Output:
 *   docs/cur8or-live-retailer-brands-variants.csv
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import https from 'https'

config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

const ES_HOST = process.env.ES_HOST || 'localhost:9200'
const ES_API_KEY = process.env.ES_API_KEY
const PRODUCTS_INDEX = process.env.PRODUCTS_INDEX || 'products'
const COMPARE = process.argv.includes('--compare')

const OLD_CSV_PATH = resolve(process.cwd(), 'docs/cur8or-live-retailer-brands.csv')
const OUTPUT_PATH = resolve(process.cwd(), 'docs/cur8or-live-retailer-brands-variants.csv')

// Determine protocol from ES_HOST or default to https for localhost
const esBaseUrl = ES_HOST.startsWith('http') ? ES_HOST : `https://${ES_HOST}`

interface EsAggBucket {
  key: string
  doc_count: number
}

async function esQuery(body: object): Promise<any> {
  const url = `${esBaseUrl}/${PRODUCTS_INDEX}/_search`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (ES_API_KEY) {
    headers['Authorization'] = `ApiKey ${ES_API_KEY}`
  }

  const payload = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(payload),
      },
      rejectUnauthorized: false, // self-signed cert
    }

    const proto = parsedUrl.protocol === 'https:' ? https : require('http')
    const req = proto.request(options, (res: any) => {
      let data = ''
      res.on('data', (chunk: string) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error(`Failed to parse ES response: ${data.slice(0, 500)}`))
        }
      })
    })

    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function getAllStores(): Promise<EsAggBucket[]> {
  console.log('Fetching all stores from ES...')
  const result = await esQuery({
    size: 0,
    aggs: {
      stores: {
        terms: { field: 'store.keyword', size: 1000 },
      },
    },
  })

  if (result.error) {
    throw new Error(`ES error: ${JSON.stringify(result.error)}`)
  }

  const buckets: EsAggBucket[] = result.aggregations.stores.buckets
  console.log(`Found ${buckets.length} stores`)
  return buckets
}

async function getBrandsForStore(store: string): Promise<EsAggBucket[]> {
  const result = await esQuery({
    size: 0,
    query: { term: { 'store.keyword': store } },
    aggs: {
      variant_brands: {
        nested: { path: 'variants' },
        aggs: {
          brands: {
            terms: { field: 'variants.brand.keyword', size: 10000 },
          },
        },
      },
    },
  })

  if (result.error) {
    throw new Error(`ES error for store ${store}: ${JSON.stringify(result.error)}`)
  }

  return result.aggregations.variant_brands.brands.buckets
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function loadOldCsv(): Map<string, Map<string, number>> {
  const raw = readFileSync(OLD_CSV_PATH, 'utf8')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const result = new Map<string, Map<string, number>>()

  for (const line of lines.slice(1)) {
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (c === ',' && !inQuotes) {
        fields.push(current)
        current = ''
        continue
      }
      current += c
    }
    fields.push(current)

    const [store, brand, countStr] = fields
    if (!store || !brand) continue

    if (!result.has(store)) result.set(store, new Map())
    result.get(store)!.set(brand, Number(countStr) || 0)
  }

  return result
}

async function main() {
  console.log(`ES: ${esBaseUrl}`)
  console.log(`Index: ${PRODUCTS_INDEX}`)
  console.log('')

  const stores = await getAllStores()

  type BrandRow = { store: string; brand: string; doc_count: number }
  const allRows: BrandRow[] = []

  for (const storeBucket of stores) {
    const store = storeBucket.key
    process.stdout.write(`  ${store}...`)
    const brands = await getBrandsForStore(store)
    console.log(` ${brands.length} brands`)

    for (const brandBucket of brands) {
      allRows.push({
        store,
        brand: brandBucket.key,
        doc_count: brandBucket.doc_count,
      })
    }
  }

  // Sort by store then doc_count descending
  allRows.sort((a, b) => {
    const storeCmp = a.store.localeCompare(b.store)
    if (storeCmp !== 0) return storeCmp
    return b.doc_count - a.doc_count
  })

  // Write CSV
  const csvLines = ['store,brand,doc_count']
  for (const row of allRows) {
    csvLines.push(`${escapeCsvField(row.store)},${escapeCsvField(row.brand)},${row.doc_count}`)
  }
  writeFileSync(OUTPUT_PATH, csvLines.join('\n') + '\n', 'utf8')
  console.log(`\nWrote ${allRows.length} brand rows to ${OUTPUT_PATH}`)

  // Summary by store
  const storeGrouped = new Map<string, number>()
  for (const row of allRows) {
    storeGrouped.set(row.store, (storeGrouped.get(row.store) || 0) + 1)
  }
  console.log(`\nStore summary (${storeGrouped.size} stores):`)
  const sortedStores = [...storeGrouped.entries()].sort((a, b) => b[1] - a[1])
  for (const [store, count] of sortedStores.slice(0, 20)) {
    console.log(`  ${store}: ${count} brands`)
  }
  if (sortedStores.length > 20) {
    console.log(`  ... and ${sortedStores.length - 20} more stores`)
  }

  // Comparison mode
  if (COMPARE) {
    console.log('\n--- COMPARISON WITH EXISTING CSV ---')
    try {
      const oldData = loadOldCsv()
      const newStoreMap = new Map<string, Map<string, number>>()

      for (const row of allRows) {
        if (!newStoreMap.has(row.store)) newStoreMap.set(row.store, new Map())
        newStoreMap.get(row.store)!.set(row.brand, row.doc_count)
      }

      // Stores in new but not old
      const newStores = [...newStoreMap.keys()].filter((s) => !oldData.has(s))
      if (newStores.length > 0) {
        console.log(`\nNew stores not in old CSV (${newStores.length}):`)
        for (const s of newStores.slice(0, 30)) {
          console.log(`  + ${s} (${newStoreMap.get(s)!.size} brands)`)
        }
        if (newStores.length > 30) console.log(`  ... and ${newStores.length - 30} more`)
      }

      // Stores in old but not new
      const missingStores = [...oldData.keys()].filter((s) => !newStoreMap.has(s))
      if (missingStores.length > 0) {
        console.log(`\nStores in old CSV but no longer in ES (${missingStores.length}):`)
        for (const s of missingStores) console.log(`  - ${s}`)
      }

      // Brand delta per shared store
      let totalNewBrands = 0
      let totalLostBrands = 0
      const sharedStores = [...oldData.keys()].filter((s) => newStoreMap.has(s))
      console.log(`\nBrand changes for ${sharedStores.length} shared stores:`)

      for (const store of sharedStores) {
        const oldBrands = oldData.get(store)!
        const newBrands = newStoreMap.get(store)!

        const added = [...newBrands.keys()].filter((b) => !oldBrands.has(b))
        const removed = [...oldBrands.keys()].filter((b) => !newBrands.has(b))

        if (added.length > 0 || removed.length > 0) {
          console.log(`  ${store}: +${added.length} new, -${removed.length} lost`)
          totalNewBrands += added.length
          totalLostBrands += removed.length
        }
      }

      console.log(`\nTotals: +${totalNewBrands} new brand-store links, -${totalLostBrands} removed`)
    } catch (err: any) {
      console.log(`Could not load old CSV for comparison: ${err.message}`)
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
