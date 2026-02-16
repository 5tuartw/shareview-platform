export interface ClassifierOptions {
  retailer?: string
  month?: string
  dryRun?: boolean
}

export interface ClassificationResult {
  domain: string
  retailerId: string
  month: string
  counts: Record<string, number>
  operation: 'classified' | 'skipped'
}

export interface SnapshotToClassify {
  id: number
  retailerId: string
  rangeStart: string
  rangeEnd: string
}
