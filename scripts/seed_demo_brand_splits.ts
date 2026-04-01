import { config } from 'dotenv'
import { resolve } from 'path'
import { Pool, type PoolClient } from 'pg'
import { BRAND_SPLIT_SCOPE_VALUES, normaliseBrandSplitText } from '../lib/keyword-brand-splits'

config({ path: resolve(process.cwd(), '.env.local') })

const EXECUTE = process.argv.includes('--execute')
const RANGE_TYPE = 'month'
const ALIAS_SOURCE_PREFIX = 'demo-brand-splits'

const pool = new Pool({
  host: process.env.SV_DB_HOST,
  port: Number(process.env.SV_DB_PORT || '5437'),
  user: process.env.SV_DB_USER,
  password: process.env.SV_DB_PASS,
  database: process.env.SV_DB_NAME,
})

type DemoRetailerConfig = {
  demoRetailerId: string
  demoRetailerName: string
  sourceRetailerId: string
  aliases: Array<{ alias: string; aliasType: 'search_term' | 'typo' }>
}

type DemoKeywordSnapshotRow = {
  range_start: string
  range_end: string
  total_keywords: string | number
  total_impressions: string | number
  total_clicks: string | number
  total_conversions: string | number
  actual_data_start: string | null
  actual_data_end: string | null
}

type SourceTermRow = {
  search_term: string
  total_impressions: string | number
  total_clicks: string | number
  total_conversions: string | number
}

type Classification = 'generic' | 'brand_and_term' | 'brand_only'

type DetailRow = {
  searchTerm: string
  normalizedSearchTerm: string
  classification: Classification
  matchedAliases: string[]
  matchedBrandLabels: string[]
  impressions: number
  clicks: number
  conversions: number
  ctr: number | null
  cvr: number | null
}

type SummaryBucket = {
  search_terms: number
  impressions: number
  clicks: number
  conversions: number
  share_of_total_conversions_pct: number
}

type BucketTotals = {
  generic: SummaryBucket
  brand_and_term: SummaryBucket
  brand_only: SummaryBucket
}

const DEMO_RETAILERS: DemoRetailerConfig[] = [
  {
    demoRetailerId: 'demo',
    demoRetailerName: 'Meridian Health',
    sourceRetailerId: 'boots',
    aliases: [
      { alias: 'Meridian', aliasType: 'search_term' },
      { alias: 'Meridien Health', aliasType: 'typo' },
      { alias: 'MeridianHealth', aliasType: 'search_term' },
    ],
  },
  {
    demoRetailerId: 'demo2',
    demoRetailerName: 'Activ8',
    sourceRetailerId: 'jd-williams',
    aliases: [
      { alias: 'Activ 8', aliasType: 'search_term' },
      { alias: 'Active8', aliasType: 'typo' },
      { alias: 'Activ-8', aliasType: 'search_term' },
    ],
  },
]

const hashText = (value: string): number => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua', 'veniam',
  'nostrud', 'ullamco', 'commodo', 'consequat',
]

const buildJargonPhrase = (value: string, prefix: string): string => {
  const hash = hashText(value || prefix)
  const w1 = LOREM_WORDS[hash % LOREM_WORDS.length]
  const w2 = LOREM_WORDS[(hash >>> 5) % LOREM_WORDS.length]
  const w3 = LOREM_WORDS[(hash >>> 10) % LOREM_WORDS.length]
  const suffix = (hash % 997) + 1
  return `${prefix} ${w1} ${w2} ${w3} ${suffix}`
}

const toNumber = (value: string | number | null | undefined): number => Number(value || 0)

const lastDayOfMonth = (periodStart: string): string => {
  const date = new Date(`${periodStart}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return date.toISOString().slice(0, 10)
}

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const allocateRoundedTotal = (total: number, weights: number[], decimals: number): number[] => {
  if (weights.length === 0) return []

  const factor = 10 ** decimals
  const totalUnits = Math.round(total * factor)
  const safeWeights = weights.map((weight) => (weight > 0 ? weight : 0))
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0)
  const normalizedWeights = weightSum > 0
    ? safeWeights.map((weight) => weight / weightSum)
    : safeWeights.map(() => 1 / safeWeights.length)

  const rawUnits = normalizedWeights.map((weight) => totalUnits * weight)
  const baseUnits = rawUnits.map((value) => Math.floor(value))
  let remainder = totalUnits - baseUnits.reduce((sum, value) => sum + value, 0)

  const remainders = rawUnits
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder)

  for (let index = 0; index < remainders.length && remainder > 0; index += 1) {
    baseUnits[remainders[index].index] += 1
    remainder -= 1
  }

  return baseUnits.map((value) => value / factor)
}

const makeSummaryBucket = (
  totalConversions: number,
  searchTerms: number,
  impressions: number,
  clicks: number,
  conversions: number,
): SummaryBucket => ({
  search_terms: searchTerms,
  impressions,
  clicks,
  conversions,
  share_of_total_conversions_pct: totalConversions > 0 ? roundTo((conversions / totalConversions) * 100, 4) : 0,
})

const buildBucketTotals = (
  demoRetailerId: string,
  periodStart: string,
  snapshot: DemoKeywordSnapshotRow,
  brandOnlyTermCount: number,
): BucketTotals => {
  const totalKeywords = toNumber(snapshot.total_keywords)
  const totalImpressions = toNumber(snapshot.total_impressions)
  const totalClicks = toNumber(snapshot.total_clicks)
  const totalConversions = roundTo(toNumber(snapshot.total_conversions), 2)
  const seed = hashText(`${demoRetailerId}:${periodStart}`)

  const brandOnlyConvShare = totalConversions > 0 ? 0.07 + ((seed % 4) * 0.01) : 0
  const brandAndTermConvShare = totalConversions > 0 ? 0.04 + (((seed >>> 3) % 4) * 0.01) : 0
  const genericConvShare = Math.max(0, 1 - brandOnlyConvShare - brandAndTermConvShare)

  const brandOnlyClickShare = totalClicks > 0 ? 0.015 + (((seed >>> 5) % 3) * 0.005) : 0
  const brandAndTermClickShare = totalClicks > 0 ? 0.03 + (((seed >>> 7) % 3) * 0.01) : 0
  const genericClickShare = Math.max(0, 1 - brandOnlyClickShare - brandAndTermClickShare)

  const brandOnlyImpressionShare = totalImpressions > 0 ? 0.003 + (((seed >>> 9) % 3) * 0.001) : 0
  const brandAndTermImpressionShare = totalImpressions > 0 ? 0.012 + (((seed >>> 11) % 3) * 0.002) : 0
  const genericImpressionShare = Math.max(0, 1 - brandOnlyImpressionShare - brandAndTermImpressionShare)

  const searchTermShares = [
    Math.max(totalKeywords - brandOnlyTermCount - Math.max(12, Math.round(totalKeywords * 0.0012)), 1),
    Math.max(12, Math.round(totalKeywords * 0.0012)),
    Math.max(brandOnlyTermCount, 1),
  ]

  const [genericSearchTerms, brandAndTermSearchTerms, brandOnlySearchTerms] = allocateRoundedTotal(totalKeywords, searchTermShares, 0)
  const [genericImpressions, brandAndTermImpressions, brandOnlyImpressions] = allocateRoundedTotal(totalImpressions, [genericImpressionShare, brandAndTermImpressionShare, brandOnlyImpressionShare], 0)
  const [genericClicks, brandAndTermClicks, brandOnlyClicks] = allocateRoundedTotal(totalClicks, [genericClickShare, brandAndTermClickShare, brandOnlyClickShare], 0)
  const [genericConversions, brandAndTermConversions, brandOnlyConversions] = allocateRoundedTotal(totalConversions, [genericConvShare, brandAndTermConvShare, brandOnlyConvShare], 2)

  return {
    generic: makeSummaryBucket(totalConversions, genericSearchTerms, genericImpressions, genericClicks, genericConversions),
    brand_and_term: makeSummaryBucket(totalConversions, brandAndTermSearchTerms, brandAndTermImpressions, brandAndTermClicks, brandAndTermConversions),
    brand_only: makeSummaryBucket(totalConversions, brandOnlySearchTerms, brandOnlyImpressions, brandOnlyClicks, brandOnlyConversions),
  }
}

const makeGenericSearchTerm = (sourceTerm: string, demoRetailerId: string, periodStart: string, index: number): string =>
  buildJargonPhrase(`${demoRetailerId}:${periodStart}:${sourceTerm}:${index}`, 'term')

const makeBrandAndTermSearchTerm = (alias: string, sourceTerm: string, demoRetailerId: string, periodStart: string, index: number): string => {
  const descriptor = buildJargonPhrase(`${sourceTerm}:${demoRetailerId}:${periodStart}:${index}`, 'term')
  return `${alias} ${descriptor}`
}

const buildDetailRows = (
  configRow: DemoRetailerConfig,
  periodStart: string,
  totalConversions: number,
  sourceTerms: SourceTermRow[],
  bucketTotals: BucketTotals,
): DetailRow[] => {
  const aliasForms = [configRow.demoRetailerName, ...configRow.aliases.map((alias) => alias.alias)]
  const uniqueAliases = Array.from(new Set(aliasForms.filter(Boolean)))
  const labelArray = [configRow.demoRetailerName]

  const genericTemplateRows = sourceTerms.slice(0, Math.min(24, Math.max(sourceTerms.length, 12)))
  const genericWeights = genericTemplateRows.map((row) => Math.max(toNumber(row.total_conversions), 1))
  const genericConversions = allocateRoundedTotal(bucketTotals.generic.conversions, genericWeights, 2)
  const genericClicks = allocateRoundedTotal(bucketTotals.generic.clicks, genericWeights, 0)
  const genericImpressions = allocateRoundedTotal(bucketTotals.generic.impressions, genericWeights, 0)

  const genericRows = genericTemplateRows.map((row, index) => {
    const searchTerm = makeGenericSearchTerm(row.search_term, configRow.demoRetailerId, periodStart, index)
    const normalizedSearchTerm = normaliseBrandSplitText(searchTerm)
    const clicks = genericClicks[index] ?? 0
    const impressions = genericImpressions[index] ?? 0
    const conversions = genericConversions[index] ?? 0

    return {
      searchTerm,
      normalizedSearchTerm,
      classification: 'generic' as const,
      matchedAliases: [],
      matchedBrandLabels: [],
      impressions,
      clicks,
      conversions,
      ctr: impressions > 0 ? roundTo((clicks / impressions) * 100, 4) : null,
      cvr: clicks > 0 ? roundTo((conversions / clicks) * 100, 4) : null,
    }
  })

  const brandOnlyAliases = uniqueAliases.slice(0, Math.min(3, uniqueAliases.length))
  const brandOnlyWeights = brandOnlyAliases.map((_alias, index) => brandOnlyAliases.length - index)
  const brandOnlyConversions = allocateRoundedTotal(bucketTotals.brand_only.conversions, brandOnlyWeights, 2)
  const brandOnlyClicks = allocateRoundedTotal(bucketTotals.brand_only.clicks, brandOnlyWeights, 0)
  const brandOnlyImpressions = allocateRoundedTotal(bucketTotals.brand_only.impressions, brandOnlyWeights, 0)

  const brandOnlyRows = brandOnlyAliases.map((alias, index) => {
    const normalizedAlias = normaliseBrandSplitText(alias)
    const conversions = brandOnlyConversions[index] ?? 0
    const clicks = brandOnlyClicks[index] ?? 0
    const impressions = brandOnlyImpressions[index] ?? 0

    return {
      searchTerm: alias,
      normalizedSearchTerm: normalizedAlias,
      classification: 'brand_only' as const,
      matchedAliases: normalizedAlias ? [normalizedAlias] : [],
      matchedBrandLabels: labelArray,
      impressions,
      clicks,
      conversions,
      ctr: impressions > 0 ? roundTo((clicks / impressions) * 100, 4) : null,
      cvr: clicks > 0 ? roundTo((conversions / clicks) * 100, 4) : null,
    }
  })

  const brandAndTermCount = Math.min(8, Math.max(4, sourceTerms.length > 0 ? 6 : 4))
  const brandAndTermTemplates = Array.from({ length: brandAndTermCount }, (_unused, index) => sourceTerms[index % Math.max(sourceTerms.length, 1)] ?? {
    search_term: `${configRow.sourceRetailerId}:${periodStart}:${index}`,
    total_impressions: 1,
    total_clicks: 1,
    total_conversions: 1,
  })
  const brandAndTermWeights = brandAndTermTemplates.map((row, index) => Math.max(toNumber(row.total_conversions), brandAndTermCount - index))
  const brandAndTermConversions = allocateRoundedTotal(bucketTotals.brand_and_term.conversions, brandAndTermWeights, 2)
  const brandAndTermClicks = allocateRoundedTotal(bucketTotals.brand_and_term.clicks, brandAndTermWeights, 0)
  const brandAndTermImpressions = allocateRoundedTotal(bucketTotals.brand_and_term.impressions, brandAndTermWeights, 0)

  const brandAndTermRows = brandAndTermTemplates.map((row, index) => {
    const alias = uniqueAliases[index % uniqueAliases.length]
    const normalizedAlias = normaliseBrandSplitText(alias)
    const searchTerm = makeBrandAndTermSearchTerm(alias, row.search_term, configRow.demoRetailerId, periodStart, index)
    const normalizedSearchTerm = normaliseBrandSplitText(searchTerm)
    const conversions = brandAndTermConversions[index] ?? 0
    const clicks = brandAndTermClicks[index] ?? 0
    const impressions = brandAndTermImpressions[index] ?? 0

    return {
      searchTerm,
      normalizedSearchTerm,
      classification: 'brand_and_term' as const,
      matchedAliases: normalizedAlias ? [normalizedAlias] : [],
      matchedBrandLabels: labelArray,
      impressions,
      clicks,
      conversions,
      ctr: impressions > 0 ? roundTo((clicks / impressions) * 100, 4) : null,
      cvr: clicks > 0 ? roundTo((conversions / clicks) * 100, 4) : null,
    }
  })

  const dedupedRows = new Map<string, DetailRow>()
  for (const row of [...brandOnlyRows, ...brandAndTermRows, ...genericRows]) {
    const key = `${row.classification}:${row.normalizedSearchTerm}`
    if (!dedupedRows.has(key)) {
      dedupedRows.set(key, row)
    }
  }

  return Array.from(dedupedRows.values()).map((row) => ({
    ...row,
    share_of_total_conversions_pct: totalConversions > 0 ? roundTo((row.conversions / totalConversions) * 100, 4) : 0,
  })) as DetailRow[]
}

const ensureDemoAliases = async (client: PoolClient, configRow: DemoRetailerConfig): Promise<number> => {
  let count = 0
  for (const alias of configRow.aliases) {
    const aliasNameNormalized = normaliseBrandSplitText(alias.alias)
    if (!aliasNameNormalized) continue

    await client.query(
      `INSERT INTO retailer_aliases (
          retailer_id,
          alias_name,
          alias_name_normalized,
          alias_type,
          source,
          confidence,
          is_active,
          notes,
          metadata
       ) VALUES (
          $1, $2, $3, $4, $5, $6, true, $7, $8::jsonb
       )
       ON CONFLICT (source, alias_name_normalized)
       DO UPDATE SET
         retailer_id = EXCLUDED.retailer_id,
         alias_name = EXCLUDED.alias_name,
         alias_type = EXCLUDED.alias_type,
         confidence = EXCLUDED.confidence,
         is_active = true,
         notes = EXCLUDED.notes,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        configRow.demoRetailerId,
        alias.alias,
        aliasNameNormalized,
        alias.aliasType,
        `${ALIAS_SOURCE_PREFIX}-${configRow.demoRetailerId}`,
        alias.aliasType === 'typo' ? 0.82 : 0.95,
        'Seeded for demo Brand Splits coverage',
        JSON.stringify({ seeded_by: 'seed_demo_brand_splits' }),
      ],
    )
    count += 1
  }

  return count
}

const fetchDemoKeywordSnapshots = async (client: PoolClient, retailerId: string): Promise<DemoKeywordSnapshotRow[]> => {
  const result = await client.query<DemoKeywordSnapshotRow>(
    `SELECT range_start::text,
            range_end::text,
            total_keywords,
            total_impressions,
            total_clicks,
            total_conversions,
            actual_data_start::text,
            actual_data_end::text
     FROM keywords_snapshots
     WHERE retailer_id = $1
       AND range_type = $2
     ORDER BY range_start ASC`,
    [retailerId, RANGE_TYPE],
  )

  return result.rows
}

const fetchSourceTerms = async (client: PoolClient, retailerId: string, rangeStart: string): Promise<SourceTermRow[]> => {
  const result = await client.query<SourceTermRow>(
    `SELECT search_term, total_impressions, total_clicks, total_conversions
     FROM keyword_brand_split_term_snapshots
     WHERE retailer_id = $1
       AND range_type = $2
       AND range_start = $3::date
       AND brand_scope = 'retailer'
       AND classification = 'generic'
     ORDER BY total_conversions DESC, total_clicks DESC, search_term ASC
     LIMIT 24`,
    [retailerId, RANGE_TYPE, rangeStart],
  )

  return result.rows
}

const upsertBrandSplitSnapshot = async (
  client: PoolClient,
  configRow: DemoRetailerConfig,
  snapshot: DemoKeywordSnapshotRow,
  bucketTotals: BucketTotals,
  detailRows: DetailRow[],
): Promise<void> => {
  const rangeStart = snapshot.range_start.slice(0, 10)
  const rangeEnd = snapshot.range_end?.slice(0, 10) || lastDayOfMonth(rangeStart)
  const actualDataStart = snapshot.actual_data_start?.slice(0, 10) || rangeStart
  const actualDataEnd = snapshot.actual_data_end?.slice(0, 10) || rangeEnd
  const matchedVocabCount = 1 + configRow.aliases.length
  const totalConversions = roundTo(toNumber(snapshot.total_conversions), 2)
  const summary = {
    generic: bucketTotals.generic,
    brand_and_term: bucketTotals.brand_and_term,
    brand_only: bucketTotals.brand_only,
  }

  for (const scope of BRAND_SPLIT_SCOPE_VALUES) {
    await client.query(
      `DELETE FROM keyword_brand_split_term_snapshots
       WHERE retailer_id = $1
         AND range_type = $2
         AND range_start = $3::date
         AND range_end = $4::date
         AND brand_scope = $5`,
      [configRow.demoRetailerId, RANGE_TYPE, rangeStart, rangeEnd, scope],
    )

    await client.query(
      `DELETE FROM keyword_brand_split_snapshots
       WHERE retailer_id = $1
         AND range_type = $2
         AND range_start = $3::date
         AND range_end = $4::date
         AND brand_scope = $5`,
      [configRow.demoRetailerId, RANGE_TYPE, rangeStart, rangeEnd, scope],
    )

    await client.query(
      `INSERT INTO keyword_brand_split_snapshots (
          retailer_id,
          range_type,
          range_start,
          range_end,
          source_analysis_date,
          brand_scope,
          total_search_terms,
          total_impressions,
          total_clicks,
          total_conversions,
          matched_vocab_count,
          summary,
          actual_data_start,
          actual_data_end
       ) VALUES (
          $1, $2, $3::date, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::date, $14::date
       )`,
      [
        configRow.demoRetailerId,
        RANGE_TYPE,
        rangeStart,
        rangeEnd,
        actualDataEnd,
        scope,
        bucketTotals.generic.search_terms + bucketTotals.brand_and_term.search_terms + bucketTotals.brand_only.search_terms,
        bucketTotals.generic.impressions + bucketTotals.brand_and_term.impressions + bucketTotals.brand_only.impressions,
        bucketTotals.generic.clicks + bucketTotals.brand_and_term.clicks + bucketTotals.brand_only.clicks,
        totalConversions,
        matchedVocabCount,
        JSON.stringify(summary),
        actualDataStart,
        actualDataEnd,
      ],
    )

    for (const row of detailRows) {
      await client.query(
        `INSERT INTO keyword_brand_split_term_snapshots (
            retailer_id,
            range_type,
            range_start,
            range_end,
            source_analysis_date,
            brand_scope,
            search_term,
            normalized_search_term,
            classification,
            matched_aliases,
            matched_brand_labels,
            total_impressions,
            total_clicks,
            total_conversions,
            ctr,
            cvr,
            share_of_total_conversions_pct
         ) VALUES (
            $1, $2, $3::date, $4::date, $5::date, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17
         )`,
        [
          configRow.demoRetailerId,
          RANGE_TYPE,
          rangeStart,
          rangeEnd,
          actualDataEnd,
          scope,
          row.searchTerm,
          row.normalizedSearchTerm,
          row.classification,
          JSON.stringify(row.matchedAliases),
          JSON.stringify(row.matchedBrandLabels),
          row.impressions,
          row.clicks,
          row.conversions,
          row.ctr,
          row.cvr,
          totalConversions > 0 ? roundTo((row.conversions / totalConversions) * 100, 4) : 0,
        ],
      )
    }
  }
}

async function run(): Promise<void> {
  const client = await pool.connect()

  try {
    console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`)
    console.log(`Demo retailers: ${DEMO_RETAILERS.map((row) => `${row.demoRetailerId}<=${row.sourceRetailerId}`).join(', ')}`)

    if (EXECUTE) {
      await client.query('BEGIN')
    }

    for (const configRow of DEMO_RETAILERS) {
      const demoSnapshots = await fetchDemoKeywordSnapshots(client, configRow.demoRetailerId)

      if (demoSnapshots.length === 0) {
        console.log(`[skip] retailer=${configRow.demoRetailerId} has no keyword snapshots`)
        continue
      }

      console.log(`[retailer] ${configRow.demoRetailerId} source=${configRow.sourceRetailerId} periods=${demoSnapshots.length}`)

      for (const snapshot of demoSnapshots) {
        const period = snapshot.range_start.slice(0, 7)
        const sourceTerms = await fetchSourceTerms(client, configRow.sourceRetailerId, snapshot.range_start)

        if (sourceTerms.length === 0) {
          console.log(`[skip] retailer=${configRow.demoRetailerId} period=${period} source=${configRow.sourceRetailerId} has no source Brand Splits terms`)
          continue
        }

        const bucketTotals = buildBucketTotals(configRow.demoRetailerId, snapshot.range_start, snapshot, Math.min(3, 1 + configRow.aliases.length))
        const detailRows = buildDetailRows(configRow, snapshot.range_start, roundTo(toNumber(snapshot.total_conversions), 2), sourceTerms, bucketTotals)

        console.log(
          `[plan] retailer=${configRow.demoRetailerId} period=${period} detail_rows=${detailRows.length} total_conversions=${roundTo(toNumber(snapshot.total_conversions), 2).toFixed(2)} brand_only=${bucketTotals.brand_only.conversions.toFixed(2)} brand_and_term=${bucketTotals.brand_and_term.conversions.toFixed(2)} generic=${bucketTotals.generic.conversions.toFixed(2)}`,
        )

        if (!EXECUTE) {
          continue
        }

        await ensureDemoAliases(client, configRow)
        await upsertBrandSplitSnapshot(client, configRow, snapshot, bucketTotals, detailRows)
      }
    }

    if (EXECUTE) {
      await client.query('COMMIT')
    }

    console.log('Completed demo Brand Splits seeding.')
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