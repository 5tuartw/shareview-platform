'use client'

import React from 'react'
import { 
  PageHeadline, 
  MetricCard, 
  TrendIndicator, 
  QuickStatsBar,
  ExportButton,
  DateRangeSelector,
  InsightsPanel,
  ContextualInfoPanel
} from '@/components/shared'
import { Users, DollarSign, TrendingUp, Building2 } from 'lucide-react'

export default function ComponentShowcasePage() {
  const [selectedMonth, setSelectedMonth] = React.useState('2025-11')

  const availableMonths = [
    { value: '2025-11', label: 'November 2025' },
    { value: '2025-10', label: 'October 2025' },
    { value: '2025-09', label: 'September 2025' },
  ]

  const sampleData = [
    { name: 'John Doe', role: 'CLIENT_VIEWER', email: 'john@example.com' },
    { name: 'Jane Smith', role: 'SALES_TEAM', email: 'jane@example.com' },
  ]

  const contextualInfoItems = [
    {
      label: 'Conversion efficiency',
      text: 'Q4 conversion rate increased from 4.02% to 6.06% — a +51% year-on-year improvement',
    },
    {
      label: 'Revenue vs commission',
      text: 'Q4 revenue declined by 69% year on year while commission spend declined by 86%',
    },
  ]

  const contextualSuccessItems = [
    {
      label: 'Click quality',
      text: 'High-intent search terms lifted conversion rate by 18% across Q4',
    },
    {
      label: 'Margin protection',
      text: 'Commission rate changes kept ROI stable despite lower revenue',
    },
  ]

  const contextualWarningItems = [
    {
      label: 'Coverage gaps',
      text: 'Key seasonal SKUs are missing from the feed, limiting peak demand capture',
    },
    {
      label: 'Creative fatigue',
      text: 'Ad copy has not been refreshed in 6 weeks; refresh assets for Q1 launches',
    },
  ]

  const insightsColumns = [
    {
      insight: 'Beat rivals',
      shareightDoes: [
        'Track competitor impression share daily',
        'Flag pricing gaps where rivals undercut key SKUs',
      ],
      youCanDo: [
        'Refresh promo messaging on hero products',
        'Align seasonal pricing with top sellers',
      ],
    },
    {
      insight: 'Optimise spend',
      shareightDoes: [
        'Reduce investment on low-intent search terms',
        'Surface zero-conversion queries for review',
      ],
      youCanDo: [
        'Pause low-margin products in peak weeks',
        'Tighten feed titles to improve relevance',
      ],
    },
    {
      insight: 'Explore opportunities',
      shareightDoes: [
        'Highlight growing categories with rising CTR',
      ],
      youCanDo: [
        'Launch new seasonal ranges ahead of demand spikes',
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-brand-dark mb-2">
            Component Showcase
          </h1>
          <p className="text-gray-600">
            Design system components imported from retailer-client
          </p>
        </div>

        <section className="mb-12 bg-white rounded-xl shadow-md p-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Shared Components</h2>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">PageHeadline</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              One-sentence summary with action link to relevant details (same page anchor or different tab)
            </p>
            <div className="space-y-5">
              <PageHeadline
                status="success"
                message="All systems operational"
                subtitle="Your platform is running smoothly"
              />
              <PageHeadline
                status="warning"
                message="Action required: Update payment method"
                subtitle="Your subscription expires in 3 days"
                actionLink={{ label: 'Update Now', onClick: () => alert('Update clicked') }}
              />
              <PageHeadline
                status="critical"
                message="Service disruption detected"
                subtitle="Some features may be unavailable"
              />
              <PageHeadline
                status="info"
                message="New features available"
                subtitle="Check out the latest updates to your dashboard"
                actionLink={{ label: 'Learn More', href: '#' }}
              />
            </div>
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> status (&apos;success&apos; | &apos;warning&apos; | &apos;critical&apos; | &apos;info&apos;), message (string),
                subtitle (optional string), actionLink (optional: href/label/icon/onClick)
              </p>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">MetricCard (4-Column Grid)</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Standard layout for key metrics - always 4 cards per row, responsive on mobile
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Total Users"
                value="1,247"
                change={12.5}
                status="success"
                icon={Users}
              />
              <MetricCard
                label="Monthly Revenue"
                value="£45,230"
                change={-3.2}
                status="warning"
                icon={DollarSign}
              />
              <MetricCard
                label="Growth Rate"
                value="23.4%"
                change={8.7}
                status="success"
                icon={TrendingUp}
              />
              <MetricCard
                label="Active Retailers"
                value="142"
                subtitle="Last updated 5 mins ago"
                icon={Building2}
              />
            </div>
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> label, value, change (optional number), changeLabel (default: &apos;vs last month&apos;),
                status (&apos;success&apos; | &apos;warning&apos; | &apos;critical&apos; | &apos;neutral&apos;), subtitle (optional), icon (optional LucideIcon).
                Always use 4-column responsive grid.
              </p>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">TrendIndicator</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Inline trend arrows with percentage - supports &quot;good direction&quot; logic for contextual coloring
            </p>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Positive % (good up)</p>
                  <TrendIndicator value={15.3} format="percent" goodDirection="up" size="md" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Negative % (good up)</p>
                  <TrendIndicator value={-8.2} format="percent" goodDirection="up" size="md" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Currency</p>
                  <TrendIndicator value={1250} format="currency" goodDirection="up" size="md" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Costs (good down)</p>
                  <TrendIndicator value={-5.5} format="percent" goodDirection="down" size="md" />
                </div>
              </div>
            </div>
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> value (number), format (&apos;percent&apos; | &apos;currency&apos; | &apos;number&apos;), goodDirection
                (&apos;up&apos; | &apos;down&apos; | &apos;neutral&apos;), size (&apos;sm&apos; | &apos;md&apos; | &apos;lg&apos;). Automatically colors based on whether trend is
                positive/negative relative to goodDirection.
              </p>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">QuickStatsBar</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Horizontal metrics row - useful for secondary stats or distribution breakdowns
            </p>
            <QuickStatsBar
              items={[
                { label: 'Total Revenue', value: '£128,450', color: '#14B8A6' },
                { label: 'Conversions', value: '1,234', color: '#F59E0B' },
                { label: 'Average ROI', value: '34.2%', color: '#2ECC71' },
                { label: 'Active Campaigns', value: '12' },
              ]}
            />
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> items (array of {'{'}label, value, color?{'}'}). Responsive: stacks on mobile,
                horizontal on desktop with dividers.
              </p>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">InsightsPanel</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Strategic insights with &quot;What Shareight Does&quot; and &quot;What You Can Do&quot; columns
            </p>
            <div className="space-y-5">
              <InsightsPanel />
              <InsightsPanel
                title="Collaborative Insights"
                insights={insightsColumns}
                singleColumn={false}
              />
            </div>
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> title (optional string), insights (array of {'{'}insight, shareightDoes, youCanDo{'}'}),
                singleColumn (boolean, default: true). Use singleColumn=false for collaborative three-column layout.
              </p>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">ContextualInfoPanel</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Contextual information boxes with labeled insights - supports info, success, and warning styles
            </p>
            <div className="space-y-5">
              <ContextualInfoPanel
                title="Year-on-Year Q4 Performance Context"
                style="info"
                items={contextualInfoItems}
              />
              <ContextualInfoPanel
                title="Positive Momentum Highlights"
                style="success"
                items={contextualSuccessItems}
              />
              <ContextualInfoPanel
                title="Priority Focus Areas"
                style="warning"
                items={contextualWarningItems}
              />
            </div>
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> title (string), style (&apos;info&apos; | &apos;success&apos; | &apos;warning&apos;), items (array of {'{'}label, text{'}'}).
                Each item displays label in bold with descriptive text.
              </p>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">DateRangeSelector</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Month selector with optional quick select buttons for common date ranges
            </p>
            <div className="space-y-5">
              <DateRangeSelector
                selectedMonth={selectedMonth}
                availableMonths={availableMonths}
                onChange={setSelectedMonth}
              />
              <DateRangeSelector
                selectedMonth={selectedMonth}
                availableMonths={availableMonths}
                onChange={setSelectedMonth}
                showQuickSelect
              />
            </div>
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> selectedMonth (string), availableMonths (array of {'{'}value, label{'}'}), onChange (function),
                showQuickSelect (optional boolean). Quick select adds preset buttons for common ranges.
              </p>
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">ExportButton</h3>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              CSV export button with multiple style variants
            </p>
            <div className="bg-white rounded-lg border border-gray-200 p-6 flex flex-wrap gap-4">
              <ExportButton
                data={sampleData}
                filename="users-export"
                variant="primary"
              />
              <ExportButton
                data={sampleData}
                filename="users-export"
                variant="secondary"
                label="Download CSV"
              />
              <ExportButton
                data={sampleData}
                filename="users-export"
                variant="icon-only"
              />
            </div>
            <div className="mt-5 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Props:</strong> data (array of objects), filename (string), variant (&apos;primary&apos; | &apos;secondary&apos; | &apos;icon-only&apos;),
                label (optional string, default: &apos;Export CSV&apos;). Automatically converts data to CSV format.
              </p>
            </div>
          </div>
        </section>

        {/* Color Palette */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-brand-dark">Color Palette</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="w-full h-20 rounded mb-2" style={{ backgroundColor: '#1C1D1C' }}></div>
              <p className="text-sm font-semibold">Brand Dark</p>
              <p className="text-xs text-gray-600">#1C1D1C</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="w-full h-20 rounded mb-2" style={{ backgroundColor: '#F59E0B' }}></div>
              <p className="text-sm font-semibold">Amber</p>
              <p className="text-xs text-gray-600">#F59E0B</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="w-full h-20 rounded mb-2" style={{ backgroundColor: '#14B8A6' }}></div>
              <p className="text-sm font-semibold">Success (Teal)</p>
              <p className="text-xs text-gray-600">#14B8A6</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="w-full h-20 rounded mb-2" style={{ backgroundColor: '#DC2626' }}></div>
              <p className="text-sm font-semibold">Critical (Red)</p>
              <p className="text-xs text-gray-600">#DC2626</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
