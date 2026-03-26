'use client'

import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface SearchTermsSubTabsProps {
  activeSubTab: string
  onSubTabChange: (tab: string) => void
  retailerConfig?: { insights?: boolean; market_insights?: boolean; word_analysis?: boolean; brand_splits?: boolean }
  showBrandSplitsTab?: boolean
}

export default function SearchTermsSubTabs({
  activeSubTab,
  onSubTabChange,
  retailerConfig,
  showBrandSplitsTab = false,
}: SearchTermsSubTabsProps) {
  const features = {
    insights: true,
    market_insights: true,
    word_analysis: true,
    brand_splits: false,
    ...(retailerConfig || {}),
  }

  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(features.word_analysis !== false
      ? [{
          id: 'word-analysis',
          label: 'Word Analysis',
        }]
      : []),
    ...(showBrandSplitsTab
      ? [{
          id: 'brand-splits',
          label: 'Brand Splits',
        }]
      : []),
    ...(features.market_insights !== false
      ? [{
          id: 'market-comparison',
          label: 'Market Comparison',
        }]
      : []),
    ...(features.insights !== false ? [{ id: 'insights', label: 'Insights' }] : []),
  ]

  return <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={onSubTabChange} />
}
