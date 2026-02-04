'use client'

import React from 'react'
import { 
  PageHeadline, 
  MetricCard, 
  TrendIndicator, 
  QuickStatsBar,
  ExportButton,
  DateRangeSelector 
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-brand-dark mb-2">
            Component Showcase
          </h1>
          <p className="text-gray-600">
            Design system components imported from retailer-client
          </p>
        </div>

        {/* Page Headlines */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-brand-dark">Page Headlines</h2>
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
        </section>

        {/* Metric Cards */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-brand-dark">Metric Cards</h2>
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
        </section>

        {/* Trend Indicators */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-brand-dark">Trend Indicators</h2>
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
        </section>

        {/* Quick Stats Bar */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-brand-dark">Quick Stats Bar</h2>
          <QuickStatsBar
            items={[
              { label: 'Total Revenue', value: '£128,450', color: '#14B8A6' },
              { label: 'Conversions', value: '1,234', color: '#F59E0B' },
              { label: 'Average ROI', value: '34.2%', color: '#2ECC71' },
              { label: 'Active Campaigns', value: '12' },
            ]}
          />
        </section>

        {/* Date Range Selector */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-brand-dark">Date Range Selector</h2>
          <div className="space-y-4">
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
        </section>

        {/* Export Buttons */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-brand-dark">Export Buttons</h2>
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
