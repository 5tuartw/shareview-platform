import type { RecommendationData } from '../types'

export interface RecommendationInput {
  totalProducts: number
  starCount: number
  goodCount: number
  underperformerCount: number
  wastedClicksPercentage: number
  top1Share: number
}

const formatPercent = (value: number): string => value.toFixed(1)

export const generateRecommendations = (snapshot: RecommendationInput): RecommendationData => {
  const strongPerformers = snapshot.starCount + snapshot.goodCount
  const strongShare = snapshot.totalProducts > 0
    ? (strongPerformers / snapshot.totalProducts) * 100
    : 0

  const quickWins = [
    `Protect spend on the ${strongPerformers} star and good products driving ${formatPercent(strongShare)}% of range.`,
    `Reduce wasted clicks (${formatPercent(snapshot.wastedClicksPercentage)}%) by tightening product exclusions.`,
  ]

  const strategicMoves = [
    `Shift budget towards the top 1% of products capturing ${formatPercent(snapshot.top1Share)}% of conversions.`,
    `Refine merchandising for ${snapshot.underperformerCount} underperforming products to lift CVR.`,
  ]

  const watchList = [
    'Monitor stock availability on star products to avoid conversion leakage.',
    'Review price competitiveness on high-traffic, low-converting items.',
  ]

  return {
    quickWins,
    strategicMoves,
    watchList,
  }
}
