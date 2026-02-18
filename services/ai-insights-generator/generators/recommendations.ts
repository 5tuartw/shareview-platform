import type { RecommendationData } from '../types'

export interface RecommendationInput {
  totalProducts: number
  starCount: number
  goodCount: number
  underperformerCount: number
  wastedClicksPercentage: number
  top1Share: number
  styleDirective?: string
}

const formatPercent = (value: number): string => value.toFixed(1)

export const generateRecommendations = (snapshot: RecommendationInput): RecommendationData => {
  const strongPerformers = snapshot.starCount + snapshot.goodCount
  const strongShare = snapshot.totalProducts > 0
    ? (strongPerformers / snapshot.totalProducts) * 100
    : 0

  let quickWins = [
    `Protect spend on the ${strongPerformers} star and good products driving ${formatPercent(strongShare)}% of range.`,
    `Reduce wasted clicks (${formatPercent(snapshot.wastedClicksPercentage)}%) by tightening product exclusions.`,
  ]

  let strategicMoves = [
    `Shift budget towards the top 1% of products capturing ${formatPercent(snapshot.top1Share)}% of conversions.`,
    `Refine merchandising for ${snapshot.underperformerCount} underperforming products to lift CVR.`,
  ]

  let watchList = [
    'Monitor stock availability on star products to avoid conversion leakage.',
    'Review price competitiveness on high-traffic, low-converting items.',
  ]

  // Apply style directive
  const styleDirective = snapshot.styleDirective || 'standard'
  
  if (styleDirective === 'concise') {
    quickWins = [quickWins[0]]
    strategicMoves = [strategicMoves[0]]
    watchList = [watchList[0]]
  } else if (styleDirective === 'exec-summary') {
    quickWins = ['Executive summary: ' + quickWins[0], quickWins[1]]
    strategicMoves = ['Executive summary: ' + strategicMoves[0], strategicMoves[1]]
    watchList = ['Executive summary: ' + watchList[0], watchList[1]]
  } else if (styleDirective === 'detailed') {
    // Add 3rd bullet with extra numeric context
    quickWins.push(`${snapshot.starCount} star products represent the highest-priority scaling opportunity.`)
    strategicMoves.push(`Focus on the ${snapshot.goodCount} good-performing products to drive incremental growth.`)
    watchList.push(`Track conversion rates on the top ${Math.ceil(snapshot.totalProducts * 0.01)} products (top 1%) for optimization signals.`)
  }

  return {
    quickWins,
    strategicMoves,
    watchList,
  }
}
