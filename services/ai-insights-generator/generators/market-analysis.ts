import type { MarketAnalysisData } from '../types'

export interface MarketAnalysisInput {
  totalCategories: number
  overallCtr: number
  overallCvr: number
  healthyCount: number
  starCount: number
}

const formatPercent = (value: number): string => value.toFixed(1)

export const generateMarketAnalysis = (snapshot: MarketAnalysisInput): MarketAnalysisData => {
  const healthyShare = snapshot.totalCategories > 0
    ? ((snapshot.healthyCount + snapshot.starCount) / snapshot.totalCategories) * 100
    : 0

  const headline = `Market resilience is steady with ${formatPercent(healthyShare)}% healthy or star categories.`
  const summary = `CTR is ${formatPercent(snapshot.overallCtr)}% and CVR is ${formatPercent(snapshot.overallCvr)}%, reflecting stable demand.`

  const highlights = [
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

  return {
    headline,
    summary,
    highlights,
    risks,
  }
}
