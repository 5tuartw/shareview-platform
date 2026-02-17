import type { InsightsPanelData } from '../types'

export interface InsightsPanelInput {
  totalKeywords: number
  overallCtr: number
  overallCvr: number
  tierStarCount: number
  tierStrongCount: number
  tierUnderperformingCount: number
  tierPoorCount: number
}

const formatPercent = (value: number): string => value.toFixed(1)

export const generateInsightsPanel = (snapshot: InsightsPanelInput): InsightsPanelData => {
  const total = snapshot.totalKeywords || 0
  const highPerformers = snapshot.tierStarCount + snapshot.tierStrongCount
  const highShare = total > 0 ? (highPerformers / total) * 100 : 0
  const underperformers = snapshot.tierUnderperformingCount + snapshot.tierPoorCount
  const underShare = total > 0 ? (underperformers / total) * 100 : 0

  const beatRivals: string[] = [
    `Star and strong keywords now represent ${formatPercent(highShare)}% of the portfolio.`,
    `Overall conversion rate is holding at ${formatPercent(snapshot.overallCvr)}%.`,
  ]

  if (highShare >= 15) {
    beatRivals.push('Maintain momentum by protecting bids on the top-performing terms.')
  } else {
    beatRivals.push('Prioritise budget for top-performing terms to lift win rates.')
  }

  const optimiseSpend: string[] = [
    `Underperforming keywords account for ${formatPercent(underShare)}% of coverage.`,
    `Overall CTR is ${formatPercent(snapshot.overallCtr)}%, signalling room to refine targeting.`,
  ]

  if (underShare >= 50) {
    optimiseSpend.push('Trim low-quality queries and reallocate spend to proven themes.')
  } else {
    optimiseSpend.push('Tighten match types on low-converting queries to protect efficiency.')
  }

  const exploreOpportunities: string[] = [
    `You have ${highPerformers} high-performing keywords to scale confidently.`,
    `With ${snapshot.tierStarCount} star terms, expand coverage into adjacent categories.`,
  ]

  if (snapshot.tierStarCount >= 10) {
    exploreOpportunities.push('Test incremental budget on star terms to capture missed demand.')
  } else {
    exploreOpportunities.push('Surface new star candidates by broadening discovery campaigns.')
  }

  return {
    beatRivals,
    optimiseSpend,
    exploreOpportunities,
  }
}
