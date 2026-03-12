import { query } from '@/lib/db'

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua', 'veniam',
  'nostrud', 'ullamco', 'commodo', 'consequat',
]

const hashText = (value: string): number => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

const buildJargonPhrase = (value: string, prefix: string): string => {
  const hash = hashText(value || prefix)
  const w1 = LOREM_WORDS[hash % LOREM_WORDS.length]
  const w2 = LOREM_WORDS[(hash >>> 5) % LOREM_WORDS.length]
  const w3 = LOREM_WORDS[(hash >>> 10) % LOREM_WORDS.length]
  const suffix = (hash % 997) + 1
  return `${prefix} ${w1} ${w2} ${w3} ${suffix}`
}

export const isDemoRetailer = async (retailerId: string): Promise<boolean> => {
  const result = await query<{ is_demo: boolean }>(
    `SELECT COALESCE(is_demo, false) AS is_demo
     FROM retailers
     WHERE retailer_id = $1
     LIMIT 1`,
    [retailerId],
  )

  if (result.rows.length > 0) return result.rows[0].is_demo === true

  // Safety fallback for legacy demo aliases.
  return retailerId === 'demo' || retailerId === 'demo2'
}

const sanitiseKeywordValue = (value: unknown): string =>
  buildJargonPhrase(String(value ?? ''), 'term')

const sanitiseProductValue = (value: unknown): string =>
  buildJargonPhrase(String(value ?? ''), 'product')

const sanitiseAuctionCompetitorValue = (value: unknown): string =>
  buildJargonPhrase(String(value ?? ''), 'competitor')

export const sanitiseKeywordRows = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  rows.map((row) => ({
    ...row,
    ...(Object.prototype.hasOwnProperty.call(row, 'search_term')
      ? { search_term: sanitiseKeywordValue(row.search_term) }
      : {}),
  }))

export const sanitiseKeywordQuadrants = (quadrants: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...quadrants }
  for (const key of Object.keys(out)) {
    const value = out[key]
    if (Array.isArray(value)) {
      out[key] = sanitiseKeywordRows(value as Array<Record<string, unknown>>)
    }
  }
  return out
}

export const sanitiseKeywordMetricCards = (cards: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
  cards.map((card) => {
    if (card.label === 'Top Search Terms by Conversions') {
      return { ...card, value: 'term lorem ipsum dolor 101, term sit amet elit 202, term tempor magna aliqua 303' }
    }
    return card
  })

export const sanitiseProductRows = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  rows.map((row) => ({
    ...row,
    ...(Object.prototype.hasOwnProperty.call(row, 'product_title')
      ? { product_title: sanitiseProductValue(row.product_title) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'title')
      ? { title: sanitiseProductValue(row.title) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'name')
      ? { name: sanitiseProductValue(row.name) }
      : {}),
  }))

export const sanitiseAuctionCompetitorRows = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  rows.map((row) => ({
    ...row,
    ...(Object.prototype.hasOwnProperty.call(row, 'name')
      ? { name: sanitiseAuctionCompetitorValue(row.name) }
      : {}),
  }))

export const sanitiseAuctionEntity = <T extends { name: string } | null>(entity: T): T => {
  if (!entity) return entity
  return {
    ...entity,
    name: sanitiseAuctionCompetitorValue(entity.name),
  }
}
