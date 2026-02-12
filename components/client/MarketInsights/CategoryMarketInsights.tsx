import React from 'react'
import BenchmarkCard from './BenchmarkCard'
import BenchmarkTable from './BenchmarkTable'
import InsightPanel from './InsightPanel'
import { BarChart3, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { BenchmarkMetric } from './types'
import ThreeColumnInsights from './ThreeColumnInsights'

interface CategoryMarketInsightsProps {
  retailerId: string
}

export default function CategoryMarketInsights({ retailerId }: CategoryMarketInsightsProps) {
  const categoryMetrics: BenchmarkMetric[] = [
    {
      metric: 'Cream/Moisturizer',
      yourValue: '0%',
      sectorAvg: '12%',
      topPerformers: '20%',
      position: 'Bottom 5% ▼▼',
      gap: '-100%',
    },
    {
      metric: 'Serum',
      yourValue: '0%',
      sectorAvg: '14%',
      topPerformers: '25%',
      position: 'Bottom 5% ▼▼',
      gap: '-100%',
    },
    {
      metric: 'Own-Brand',
      yourValue: '4.2%',
      sectorAvg: '11%',
      topPerformers: '16%',
      position: 'Bottom 25% ▼',
      gap: '-62%',
    },
    {
      metric: 'Premium Brands',
      yourValue: '29%',
      sectorAvg: '18%',
      topPerformers: '35%',
      position: 'Top 20% ▲',
      gap: '+61%',
    },
    {
      metric: 'Eye Products',
      yourValue: '9%',
      sectorAvg: '10%',
      topPerformers: '15%',
      position: 'Average ●',
      gap: '-10%',
    },
    {
      metric: 'Healthcare',
      yourValue: '10%',
      sectorAvg: '12%',
      topPerformers: '35%',
      position: 'Below Avg ▼',
      gap: '-17%',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          <strong>Market Insights</strong> are based on aggregated industry data and research reports.
          Figures are illustrative and for strategic guidance purposes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BenchmarkCard
          title="Your Category Health"
          value="28% Issues"
          subtitle="Broken: 4 • Attention: 12 • Sector Avg: 18% problem categories"
          position="below"
          icon={<BarChart3 className="w-5 h-5 text-orange-600" />}
        />
        <BenchmarkCard
          title="Critical Category Issues"
          value="2 Categories"
          subtitle="Cream: 0% • Serum: 0% • 98 wasted clicks • £53k/year waste"
          position="critical"
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
        />
        <BenchmarkCard
          title="Strong Performance"
          value="Premium Brands"
          subtitle="Your: 29% CVR • Sector: 18% • Top 10%: 35% • Above average!"
          position="above"
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
        />
      </div>

      <div>
        <h2 className="text-xl font-bold text-[#1C1D1C] mb-4">Category Performance Benchmarks</h2>
        <BenchmarkTable metrics={categoryMetrics} />
      </div>

      <div>
        <h2 className="text-xl font-bold text-[#1C1D1C] mb-4">Strategic Insights</h2>

        <InsightPanel
          severity="critical"
          title="How do we improve category visibility?"
          summary="Skincare category falling behind CSS competitors due to feed quality and product coverage gaps"
          details={[
            'Makeup category: Your products appearing in only 60% of searches vs competitor CSS partners',
            'Cream/Serum feed issues: 0% CVR vs sector 12% avg - likely out-of-stock, pricing, or missing attributes',
            'Competitor CSS advantage: Better product data quality driving higher Google Shopping rankings',
            'Coverage gap: Bottom 5% position in 2 key categories (Cream, Serum) - feed completeness issue',
            'Premium brands (29% CVR, Top 20%) have good feed data - but limited to small % of catalogue',
          ]}
          actions={[
            'Skincare feed audit: Review product availability, pricing competitiveness, and attribute completeness',
            'Makeup SKU expansion: Work with retailer to ensure all in-stock products are in feed',
            'Premium brand focus: Replicate feed quality of top 29% CVR products across more catalogue',
            'Price monitoring: CSS competitiveness depends on pricing - ensure feed prices match website',
            'Commission validation: Verify Cream/Serum products are correctly tracked through affiliate network',
          ]}
          estimatedValue="£85,000/year CSS commission opportunity"
        />

        <InsightPanel
          severity="warning"
          title="How do we optimise CSS capital allocation?"
          summary="£53k/year CSS capital wasted on broken Cream/Serum feed + low-quality product matches"
          details={[
            'Cream and Serum: 98 clicks delivered but 0% conversion - CSS paying for traffic that cannot convert',
            'Premium brands converting 61% above average - CSS should focus capital here vs underperformers',
            'Broad category matching: Products appearing for generic searches with low purchase intent',
            'Healthcare competition: 10% CVR vs specialist CSS partners at 35% - wrong category for CSS investment',
          ]}
          actions={[
            'URGENT: Remove Cream/Serum products from feed until stock/pricing/data issues resolved',
            'CSS capital reallocation: Shift 15-20% from Healthcare to Premium Beauty (proven 61% higher CVR)',
            'Product title specificity: Make titles more specific to reduce broad matching on generic terms',
            'Category exclusions: Work with Google Merchant Center to exclude products from unwinnable categories',
            'Target ROAS per category: Set conservative targets on low-converting categories to protect CSS capital',
          ]}
          estimatedValue="£53,000/year CSS capital efficiency gain"
        />

        <InsightPanel
          severity="opportunity"
          title="Where is the CSS category opportunity?"
          summary="Premium brands and Gift Sets show strong CVR - CSS visibility gap vs competitors represents major commission growth"
          details={[
            'Premium brands: 29% CVR (Top 20%) but feed coverage 40% below what CSS leaders are promoting',
            'Gift Set opportunity: Fast-growing Q4 segment with 18% of your visibility vs 45% for CSS competitors',
            'Fragrance category growth: Strong seasonal demand but limited feed presence for gift sets',
            'Beauty specialist position: Already converting at 21% vs sector 15% - CSS commission per click is higher',
            'If matched CSS competitor feed coverage on premium: +6 conversions/month = £2,700/month commission',
          ]}
          actions={[
            'Feed segmentation: Create "Premium Beauty" custom label in Google Shopping for optimised Target ROAS',
            'Seasonal feed variants: Ensure "Gift Set" products have seasonal titles/images for Q4 visibility',
            'CSS capital focus: Increase Max Clicks investment in proven Top 20% CVR categories',
            'Product attribute expansion: Add "luxury", "gift", "prestige" to titles where appropriate',
            'Commission category analysis: Track which categories validate best through affiliate network',
          ]}
          estimatedValue="£150,000+/year CSS commission growth potential"
        />
      </div>

      <ThreeColumnInsights retailerId={retailerId} pageType="categories" />
    </div>
  )
}
