import type { MarketAnalysisData } from '../types'

export interface MarketAnalysisInput {
  totalCategories: number
  overallCtr: number
  overallCvr: number
  healthyCount: number
  starCount: number
  styleDirective?: string
}

const formatPercent = (value: number): string => value.toFixed(1)

export const generateMarketAnalysis = (snapshot: MarketAnalysisInput): MarketAnalysisData => {
  const healthyShare = snapshot.totalCategories > 0
    ? ((snapshot.healthyCount + snapshot.starCount) / snapshot.totalCategories) * 100
    : 0

  let headline = `Market resilience is steady with ${formatPercent(healthyShare)}% healthy or star categories.`
  const summary = `CTR is ${formatPercent(snapshot.overallCtr)}% and CVR is ${formatPercent(snapshot.overallCvr)}%, reflecting stable demand.`

  let highlights = [
    `Healthy and star categories total ${snapshot.healthyCount + snapshot.starCount} out of ${snapshot.totalCategories}.`,
    `Click efficiency remains steady at ${formatPercent(snapshot.overallCtr)}% CTR.`,
    `Conversion strength sits at ${formatPercent(snapshot.overallCvr)}% CVR across categories.`,
  ]

  const risks = [] as string[]
  if (healthyShare < 20) {
    risks.push('Category health is concentrated; diversify high-performing segments.')
  } else {
    risks.push('Monitor lower-performing categories to prevent drift.')
  }

  // Apply style directive
  const styleDirective = snapshot.styleDirective || 'standard'
  
  if (styleDirective === 'concise') {
    highlights = [highlights[0]]
  } else if (styleDirective === 'exec-summary') {
    headline = 'Executive summary: ' + headline
    highlights = highlights.slice(0, 2)
  }
  // For 'detailed' and 'standard', use all 3 highlights as-is

  return {
    headline,
    summary,
    highlights,
    risks,
  }
}
