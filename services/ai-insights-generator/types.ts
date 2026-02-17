export interface GeneratorOptions {
  retailer?: string
  month?: string
  dryRun?: boolean
}

export interface InsightsPanelData {
  beatRivals: string[]
  optimiseSpend: string[]
  exploreOpportunities: string[]
}

export interface MarketAnalysisData {
  headline: string
  summary: string
  highlights: string[]
  risks: string[]
}

export interface RecommendationData {
  quickWins: string[]
  strategicMoves: string[]
  watchList: string[]
}

export type AIInsightStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'archived'

export type AIInsightType = 'insight_panel' | 'market_analysis' | 'recommendation'

export interface AIInsightRecord {
  retailerId: string
  pageType: string
  tabName: string
  periodType: string
  periodStart: string
  periodEnd: string
  insightType: AIInsightType
  insightData: InsightsPanelData | MarketAnalysisData | RecommendationData
  modelName?: string | null
  modelVersion?: string | null
  confidenceScore?: number | null
  promptHash?: string | null
  status: AIInsightStatus
  createdBy?: number | null
  approvedBy?: number | null
  approvedAt?: string | null
  publishedBy?: number | null
  publishedAt?: string | null
  reviewNotes?: string | null
  isActive: boolean
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface GenerationJobRecord {
  id: number
  retailerId: string
  pageType: string
  tabName: string
  periodType: string
  periodStart: string
  periodEnd: string
  status: JobStatus
  createdAt: string
  startedAt?: string | null
  completedAt?: string | null
  errorMessage?: string | null
  createdBy?: number | null
}

export interface GenerationResult {
  insights: AIInsightRecord[]
  errors: string[]
  jobId?: number
}
