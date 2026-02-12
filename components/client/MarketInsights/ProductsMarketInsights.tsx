'use client'

import { Award, AlertCircle, Package, Users, BarChart3 } from 'lucide-react'
import ThreeColumnInsights from './ThreeColumnInsights'
import type { ProductsOverview } from '@/types'

interface ProductsMarketInsightsProps {
  retailerId: string
  overview: ProductsOverview
}

export default function ProductsMarketInsights({ retailerId, overview }: ProductsMarketInsightsProps) {
  const formatNumber = (value: number) => new Intl.NumberFormat('en-GB').format(value)

  const starPercentage = ((overview.star_products / overview.total_products) * 100).toFixed(1)
  const activePercentage = overview.active_products
    ? ((overview.active_products / overview.total_products) * 100).toFixed(1)
    : '0.0'
  const zeroVisibilityPercentage = overview.zero_visibility
    ? ((overview.zero_visibility / overview.total_products) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900">Product Performance Insights</h3>
        <p className="text-sm text-gray-600 mt-1">
          Strategic analysis and actionable recommendations for your product catalogue
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200 p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 mb-2">Portfolio Health Score</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-blue-800">Active Products:</span>
                  <span className="text-lg font-bold text-blue-900">{activePercentage}%</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-blue-800">Star Performers:</span>
                  <span className="text-lg font-bold text-blue-900">{starPercentage}%</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-blue-800">Zero Visibility:</span>
                  <span className="text-lg font-bold text-blue-900">{zeroVisibilityPercentage}%</span>
                </div>
              </div>
              <p className="text-xs text-blue-700 mt-3 leading-relaxed">
                Your catalogue shows {parseFloat(activePercentage) > 80 ? 'strong' : 'moderate'} visibility with{' '}
                {starPercentage}% of products delivering exceptional performance.
                {parseFloat(zeroVisibilityPercentage) > 10 && ' Focus on improving visibility for dormant products.'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200 p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-600 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-green-900 mb-2">Conversion Volume</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-green-800">Total Conversions:</span>
                  <span className="text-lg font-bold text-green-900">{formatNumber(overview.total_conversions)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-green-800">Avg per Product:</span>
                  <span className="text-lg font-bold text-green-900">
                    {overview.active_products ? (overview.total_conversions / overview.active_products).toFixed(1) : '0.0'}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-green-800">Star Products:</span>
                  <span className="text-lg font-bold text-green-900">{formatNumber(overview.star_products)}</span>
                </div>
              </div>
              <p className="text-xs text-green-700 mt-3 leading-relaxed">
                {parseFloat(starPercentage) < 5
                  ? `Conversions are highly concentrated. Top ${starPercentage}% of products drive disproportionate value.`
                  : `Healthy conversion distribution across ${starPercentage}% star performers.`}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200 p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-purple-900 mb-2">Conversion Performance</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-purple-800">Average CVR:</span>
                  <span className="text-lg font-bold text-purple-900">{overview.avg_cvr.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-purple-800">Best CVR:</span>
                  <span className="text-lg font-bold text-purple-900">
                    {overview.top_by_cvr?.[0]?.cvr.toFixed(2) || '0.00'}%
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-purple-800">Average CTR:</span>
                  <span className="text-lg font-bold text-purple-900">{overview.avg_ctr.toFixed(2)}%</span>
                </div>
              </div>
              <p className="text-xs text-purple-700 mt-3 leading-relaxed">
                {overview.avg_cvr > 3
                  ? 'Strong conversion rates indicate effective product-market fit and competitive positioning.'
                  : 'Conversion rates suggest opportunities for optimisation in pricing, images, or product selection.'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200 p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-600 rounded-lg">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 mb-2">Optimisation Opportunities</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-amber-800">Needs Attention:</span>
                  <span className="text-lg font-bold text-amber-900">{formatNumber(overview.needs_attention || 0)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-amber-800">Zero Visibility:</span>
                  <span className="text-lg font-bold text-amber-900">{formatNumber(overview.zero_visibility || 0)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-amber-800">Active Products:</span>
                  <span className="text-lg font-bold text-amber-900">{formatNumber(overview.active_products || 0)}</span>
                </div>
              </div>
              <p className="text-xs text-amber-700 mt-3 leading-relaxed">
                {(overview.needs_attention || 0) + (overview.zero_visibility || 0) > overview.total_products * 0.2
                  ? `High opportunity count. Focus on the ${formatNumber(
                      (overview.needs_attention || 0) + (overview.zero_visibility || 0)
                    )} products requiring attention.`
                  : 'Healthy catalogue with manageable optimisation workload.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Strategic Recommendations
        </h4>
        <div className="space-y-4">
          {parseFloat(starPercentage) < 10 && (
            <div className="border-l-4 border-blue-500 bg-blue-50 p-4">
              <h5 className="font-medium text-blue-900 mb-2">Identify and Scale Star Products</h5>
              <p className="text-sm text-blue-800 mb-2">
                Only {starPercentage}% of your catalogue are star performers. These products demonstrate strong market fit.
              </p>
              <ul className="text-sm text-blue-700 space-y-1 ml-4">
                <li>Analyse characteristics of your top {formatNumber(overview.star_products)} products</li>
                <li>Increase budget allocation to star performers</li>
                <li>Source similar products that match successful patterns</li>
                <li>Consider exclusive deals or promotional support</li>
              </ul>
            </div>
          )}

          {parseFloat(zeroVisibilityPercentage) > 15 && (
            <div className="border-l-4 border-red-500 bg-red-50 p-4">
              <h5 className="font-medium text-red-900 mb-2">Address Zero-Visibility Products</h5>
              <p className="text-sm text-red-800 mb-2">
                {zeroVisibilityPercentage}% ({formatNumber(overview.zero_visibility || 0)} products) have no impressions.
              </p>
              <ul className="text-sm text-red-700 space-y-1 ml-4">
                <li>Audit product data quality (titles, descriptions, images)</li>
                <li>Verify stock status and availability</li>
                <li>Review pricing competitiveness</li>
                <li>Consider removing non-viable products from feed</li>
                <li>Reallocate budget from dormant to active products</li>
              </ul>
            </div>
          )}

          {overview.avg_cvr < 2.5 && (
            <div className="border-l-4 border-amber-500 bg-amber-50 p-4">
              <h5 className="font-medium text-amber-900 mb-2">Improve Conversion Rates</h5>
              <p className="text-sm text-amber-800 mb-2">
                Average CVR of {overview.avg_cvr.toFixed(2)}% is below industry benchmarks (typically 2.5% to 4%).
              </p>
              <ul className="text-sm text-amber-700 space-y-1 ml-4">
                <li>Test premium vs value product mix</li>
                <li>Optimise product images and descriptions</li>
                <li>Review pricing strategy against competitors</li>
                <li>Ensure product availability and fast shipping</li>
                <li>Consider offering exclusive deals or bundles</li>
              </ul>
            </div>
          )}

          {parseFloat(starPercentage) < 5 && (
            <div className="border-l-4 border-purple-500 bg-purple-50 p-4">
              <h5 className="font-medium text-purple-900 mb-2">Diversify Conversion Sources</h5>
              <p className="text-sm text-purple-800 mb-2">
                Conversions are highly concentrated in {starPercentage}% of products. This creates risk.
              </p>
              <ul className="text-sm text-purple-700 space-y-1 ml-4">
                <li>Identify mid-tier products with potential</li>
                <li>Test promotional campaigns on promising products</li>
                <li>Expand into complementary product categories</li>
                <li>Reduce dependency on a few hero products</li>
              </ul>
            </div>
          )}

          {parseFloat(starPercentage) >= 10 && overview.avg_cvr >= 2.5 && parseFloat(zeroVisibilityPercentage) < 15 && (
            <div className="border-l-4 border-green-500 bg-green-50 p-4">
              <h5 className="font-medium text-green-900 mb-2">Strong Product Performance</h5>
              <p className="text-sm text-green-800 mb-2">
                Your catalogue demonstrates healthy metrics across all key dimensions.
              </p>
              <ul className="text-sm text-green-700 space-y-1 ml-4">
                <li>{starPercentage}% star performers - excellent product-market fit</li>
                <li>{overview.avg_cvr.toFixed(2)}% average CVR - strong conversion performance</li>
                <li>{activePercentage}% active visibility - good catalogue coverage</li>
                <li>Focus: maintain momentum and explore incremental optimisations</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 p-6">
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-600" />
          Market Context
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Industry Benchmark</p>
            <p className="text-xs text-gray-500 mb-2">Average CVR: 2.5% to 4.0%</p>
            <p className="text-xs text-gray-600">
              Your CVR ({overview.avg_cvr.toFixed(2)}%) is {overview.avg_cvr >= 2.5 ? 'on or above' : 'below'} the industry average.
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Product Vitality</p>
            <p className="text-xs text-gray-500 mb-2">Target: 85% or higher active</p>
            <p className="text-xs text-gray-600">
              {activePercentage}% of your catalogue is active.
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Star Performer Ratio</p>
            <p className="text-xs text-gray-500 mb-2">Target: 10% to 15%</p>
            <p className="text-xs text-gray-600">
              {starPercentage}% star products in your catalogue.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4 italic">
          Competitive data and sector benchmarks will be populated with real competitor insights in future releases.
        </p>
      </div>

      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Award className="w-5 h-5 text-blue-600" />
          30-Day Action Plan
        </h4>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <div>
              <p className="text-sm font-medium text-blue-900">Week 1: Audit and Prioritise</p>
              <p className="text-xs text-blue-700">
                Review top {formatNumber(overview.star_products)} star products and identify common success factors.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <div>
              <p className="text-sm font-medium text-blue-900">Week 2: Fix Critical Issues</p>
              <p className="text-xs text-blue-700">
                Address {formatNumber(overview.zero_visibility || 0)} zero-visibility products through data quality and availability fixes.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <p className="text-sm font-medium text-blue-900">Week 3: Optimise Performance</p>
              <p className="text-xs text-blue-700">
                Test improvements on {formatNumber(overview.needs_attention || 0)} underperforming products.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
            <div>
              <p className="text-sm font-medium text-blue-900">Week 4: Scale Success</p>
              <p className="text-xs text-blue-700">Increase investment in validated winners and replicate successful patterns.</p>
            </div>
          </div>
        </div>
      </div>

      <ThreeColumnInsights retailerId={retailerId} pageType="products" />
    </div>
  )
}
