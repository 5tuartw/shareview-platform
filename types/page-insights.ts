export interface PageHeadlineData {
  status: 'success' | 'warning' | 'critical' | 'info'
  message: string
  subtitle?: string
}

export interface MetricCardData {
  label: string
  value: string | number
  change?: number
  status?: 'success' | 'warning' | 'critical' | 'neutral'
  subtitle?: string
}

export interface ContextualInfoData {
  title: string
  style?: 'info' | 'success' | 'warning'
  items: Array<{ label: string; text: string }>
}

export interface InsightsPanelData {
  title?: string
  insights?: Array<{
    insight: string
    observationsAndActions?: string[]
    shareightDoes?: string[]
    youCanDo?: string[]
  }>
  singleColumn?: boolean
}

export interface PageInsightsResponse {
  headline: PageHeadlineData | null
  metricCards: MetricCardData[]
  contextualInfo: ContextualInfoData | null
  insightsPanel: InsightsPanelData | null
}
