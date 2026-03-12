'use client'

import SubTabNavigation from '@/components/shared/SubTabNavigation'

interface SearchTermsSubTabsProps {
  activeSubTab: string
  onSubTabChange: (tab: string) => void
  retailerConfig?: { insights?: boolean; market_insights?: boolean; word_analysis?: boolean }
  marketComparisonHiddenForRetailer?: boolean
}

export default function SearchTermsSubTabs({
  activeSubTab,
  onSubTabChange,
  retailerConfig,
  marketComparisonHiddenForRetailer = false,
}: SearchTermsSubTabsProps) {
  const features = retailerConfig || { insights: true, market_insights: true, word_analysis: true }

  const tabs = [
    { id: 'performance', label: 'Performance' },
    ...(features.word_analysis !== false ? [{ id: 'word-analysis', label: 'Word Analysis' }] : []),
    ...(features.market_insights !== false
      ? [{
          id: 'market-comparison',
          label: marketComparisonHiddenForRetailer
            ? 'Market Comparison - Hidden for retailer'
            : 'Market Comparison',
        }]
      : []),
    ...(features.insights !== false ? [{ id: 'insights', label: 'Insights' }] : []),
  ]

  return <SubTabNavigation activeTab={activeSubTab} tabs={tabs} onTabChange={onSubTabChange} />
}
