export type BenchmarkPosition = 'above' | 'average' | 'below' | 'critical'

export type InsightSeverity = 'critical' | 'warning' | 'opportunity' | 'strength'

export interface BenchmarkCardData {
  title: string
  value: string | number
  subtitle: string
  position: BenchmarkPosition
  icon?: React.ReactNode
}

export interface BenchmarkMetric {
  metric: string
  yourValue: string | number
  sectorAvg: string | number
  topPerformers: string | number
  position: string
  gap: string
}

export interface InsightData {
  severity: InsightSeverity
  title: string
  summary: string
  details: string[]
  actions: string[]
  estimatedValue?: string
}

export interface SectorBenchmark {
  avgCvr: number
  avgRoi: number
  avgKeywords: number
  avgDeadKeywords: number
  avgConvertingRate: number
}
