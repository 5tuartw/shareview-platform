import type { InsightsPanelData } from '../types'

export interface InsightsPanelInput {
  totalKeywords: number
  overallCtr: number
  overallCvr: number
  tierStarCount: number
  tierStrongCount: number
  tierUnderperformingCount: number
  tierPoorCount: number
  styleDirective?: string
}

const formatPercent = (value: number): string => value.toFixed(1)

export const generateInsightsPanel = (snapshot: InsightsPanelInput): InsightsPanelData => {
  const total = snapshot.totalKeywords || 0
  const highPerformers = snapshot.tierStarCount + snapshot.tierStrongCount
  const highShare = total > 0 ? (highPerformers / total) * 100 : 0
  const underperformers = snapshot.tierUnderperformingCount + snapshot.tierPoorCount
  const underShare = total > 0 ? (underperformers / total) * 100 : 0

  let beatRivals: string[] = [
    `Star and strong keywords now represent ${formatPercent(highShare)}% of the portfolio.`,
    `Overall conversion rate is holding at ${formatPercent(snapshot.overallCvr)}%.`,
  ]

  if (highShare >= 15) {
    beatRivals.push('Maintain momentum by protecting bids on the top-performing terms.')
  } else {
    beatRivals.push('Prioritise budget for top-performing terms to lift win rates.')
  }

  let optimiseSpend: string[] = [
    `Underperforming keywords account for ${formatPercent(underShare)}% of coverage.`,
    `Overall CTR is ${formatPercent(snapshot.overallCtr)}%, signalling room to refine targeting.`,
  ]

  if (underShare >= 50) {
    optimiseSpend.push('Trim low-quality queries and reallocate spend to proven themes.')
  } else {
    optimiseSpend.push('Tighten match types on low-converting queries to protect efficiency.')
  }

  let exploreOpportunities: string[] = [
    `You have ${highPerformers} high-performing keywords to scale confidently.`,
    `With ${snapshot.tierStarCount} star terms, expand coverage into adjacent categories.`,
  ]

  if (snapshot.tierStarCount >= 10) {
    exploreOpportunities.push('Test incremental budget on star terms to capture missed demand.')
  } else {
    exploreOpportunities.push('Surface new star candidates by broadening discovery campaigns.')
  }

  // Apply style directive
  const styleDirective = snapshot.styleDirective || 'standard'
  
  if (styleDirective === 'concise') {
    beatRivals = [beatRivals[0]]
    optimiseSpend = [optimiseSpend[0]]
    exploreOpportunities = [exploreOpportunities[0]]
  } else if (styleDirective === 'exec-summary') {
    beatRivals = ['Executive summary: ' + beatRivals[0], beatRivals[1]]
    optimiseSpend = ['Executive summary: ' + optimiseSpend[0], optimiseSpend[1]]
    exploreOpportunities = ['Executive summary: ' + exploreOpportunities[0], exploreOpportunities[1]]
  } else if (styleDirective === 'detailed') {
    // Ensure 3 bullets for detailed mode
    if (beatRivals.length < 3) {
      beatRivals.push(`${snapshot.tierStarCount} star keywords are ready for expanded budget allocation.`)
    }
    if (optimiseSpend.length < 3) {
      optimiseSpend.push(`${snapshot.tierPoorCount} poor-performing terms should be reviewed for exclusion.`)
    }
    if (exploreOpportunities.length < 3) {
      exploreOpportunities.push(`${snapshot.tierStrongCount} strong keywords offer additional scaling potential.`)
    }
  }

  return {
    beatRivals,
    optimiseSpend,
    exploreOpportunities,
  }
}
